/**
 * generate-deck job — runs in AppJobRoom so it survives the request that
 * started it, retries on crash, and can take as long as the AI calls need.
 *
 *   1. Load the deck row (status queued) and its extracted notes text.
 *   2. Anthropic → validated, option-shuffled questions. Fatal on failure.
 *   3. Write question rows (cleared first, so a retried job never duplicates).
 *   4. Mark the deck playable (status ready) immediately.
 *   5. In parallel, best-effort extras: the study kit (summary, concepts,
 *      cheat sheet, concept map), ElevenLabs narration per question, and
 *      Gemini cover art. A failure here never blocks play.
 */

import { appFiles } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createActionTools } from './action-routes'
import { base64ToBlob, generateCover, generateQuiz, narrateQuestion } from './ai'
import { isDifficulty } from '../lib/game-logic'
import { buildKitForDeck } from './generate-kit'

export interface GenerateDeckPayload {
  deckId: string
  userId: string
}

interface DeckRow extends Record<string, unknown> {
  title?: string
  sourceName?: string
  sourceText?: string
  questionCount?: number
  difficulty?: string
  narrate?: number
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * 2 ** i))
    }
  }
  throw last
}

/** Run tasks with at most `limit` in flight. */
async function runBounded<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await task(item)
    }
  })
  await Promise.all(workers)
}

export async function runGenerateDeck(payload: GenerateDeckPayload, ctx: JobContext, env: Env) {
  const { deckId, userId } = payload
  // Background work has no live caller JWT; integrations are developer-billed.
  const tools = createActionTools(env, userId, env.APP_OWNER_JWT)
  const setDeck = (patch: Record<string, unknown>) => tools.update('decks', deckId, patch)

  const got = await tools.get<DeckRow>('decks', deckId)
  if (!got.success) throw new Error(`deck_missing: ${got.error}`)
  const deck = got.data.record.data
  const notes = deck.sourceText ?? ''
  const count = Number(deck.questionCount) || 10
  const difficulty = isDifficulty(deck.difficulty) ? deck.difficulty : 'medium'

  try {
    ctx.progress(0.05, 'Reading your notes')
    await setDeck({ status: 'generating', progress: 0.05, statusMessage: 'Reading your notes…' })

    const quiz = await withRetry(() =>
      generateQuiz(tools, { notes, count, difficulty, titleHint: deck.title || deck.sourceName }),
    )

    ctx.progress(0.45, 'Saving questions')
    await setDeck({ progress: 0.45, statusMessage: 'Writing questions…' })

    // Idempotent on retry: clear anything a previous attempt wrote.
    for (;;) {
      const del = await tools.deleteWhere('questions', { deckId }, 100)
      if (!del.success || del.data.deleted < 100) break
    }

    const questionIds: string[] = []
    for (const [idx, q] of quiz.questions.entries()) {
      const created = await tools.create('questions', {
        deckId,
        idx,
        prompt: q.prompt,
        options: JSON.stringify(q.options),
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        audioUrl: '',
      })
      if (!created.success) throw new Error(`question_write_failed: ${created.error}`)
      questionIds.push(created.data.recordId)
    }

    await setDeck({
      // Keep a title the user typed; otherwise use the model's topic title.
      title: deck.title?.trim() ? deck.title : quiz.title,
      summary: quiz.summary,
      questionCount: quiz.questions.length,
      status: 'ready',
      progress: 0.6,
      statusMessage: deck.narrate
        ? 'Playable now — writing study kit and recording narration…'
        : 'Playable now — writing study kit…',
    })

    // ── Best-effort media ──────────────────────────────────────────────
    const files = appFiles(env, { scope: 'app', userId })
    let done = 0
    let audioFailures = 0
    const mediaTotal = (deck.narrate ? quiz.questions.length : 0) + 2 // + cover + kit

    const tick = async (label: string) => {
      done++
      const p = 0.6 + 0.4 * (done / mediaTotal)
      ctx.progress(p, label)
      await setDeck({ progress: p })
    }

    const finalTitle = deck.title?.trim() ? deck.title : quiz.title
    const kitTask = (async () => {
      await buildKitForDeck(tools, deckId, { notes, title: finalTitle })
      await tick('Study kit')
    })()

    const coverTask = (async () => {
      try {
        const b64 = await withRetry(() => generateCover(tools, quiz.title, quiz.summary), 2)
        const file = await files.upload(base64ToBlob(b64, 'image/png'), {
          key: `decks/${deckId}/cover.png`,
          name: 'cover.png',
        })
        await setDeck({ coverUrl: file.path })
      } catch (err) {
        console.error(`[generate-deck ${deckId}] cover failed`, err instanceof Error ? err.message : err)
      }
      await tick('Cover art')
    })()

    if (deck.narrate) {
      await runBounded(
        quiz.questions.map((q, idx) => ({ q, idx })),
        3,
        async ({ q, idx }) => {
          try {
            const b64 = await withRetry(() => narrateQuestion(tools, q.prompt, q.options), 2)
            const file = await files.upload(base64ToBlob(b64, 'audio/mpeg'), {
              key: `decks/${deckId}/q${idx}.mp3`,
              name: `q${idx}.mp3`,
            })
            await tools.update('questions', questionIds[idx], { audioUrl: file.path })
          } catch (err) {
            audioFailures++
            console.error(`[generate-deck ${deckId}] narration ${idx} failed`, err instanceof Error ? err.message : err)
          }
          await tick('Narration')
        },
      )
    }
    await Promise.all([coverTask, kitTask])

    await setDeck({
      progress: 1,
      audioFailures,
      statusMessage: audioFailures ? `${audioFailures} narration clip(s) unavailable` : '',
    })
    return { questions: quiz.questions.length, audioFailures }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[generate-deck ${deckId}] failed`, message)
    await setDeck({
      status: 'failed',
      statusMessage: message.startsWith('quiz_parse_failed')
        ? 'The AI could not build enough good questions from these notes. Try longer or more detailed notes.'
        : 'Generation failed. Please try again.',
    })
    // Do not rethrow: the deck row already tells the user; a JobRoom retry
    // would only repeat the same failing prompt and bill it twice.
    return { failed: message }
  }
}
