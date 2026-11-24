/**
 * Study kit generation.
 *
 * `buildKitForDeck` runs inside the generate-deck job right after the quiz
 * is saved (so the deck is already playable), and on its own as the
 * 'generate-kit' job — for a retry, or for decks made before kits existed.
 * The kit row's status drives the live progress on the deck page.
 */

import type { ActionTools, JobContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createActionTools } from './action-routes'
import { generateKit } from './ai'

export interface GenerateKitPayload {
  deckId: string
  userId: string
}

interface KitRow extends Record<string, unknown> {
  deckId: string
}
interface QuestionRow extends Record<string, unknown> {
  idx: number
  prompt: string
}

/** Create or reset the deck's kit row and return its id. */
export async function upsertKit(tools: ActionTools, deckId: string, patch: Record<string, unknown>) {
  const found = await tools.query<KitRow>('kits', { where: { deckId }, limit: 1 })
  const existing = found.success ? found.data.records[0] : undefined
  if (existing) {
    await tools.update('kits', existing.recordId, patch)
    return existing.recordId
  }
  const created = await tools.create('kits', {
    deckId,
    summary: '',
    concepts: '[]',
    cheatSheet: '[]',
    conceptMap: '{"nodes":[],"edges":[]}',
    questionConcepts: '[]',
    ...patch,
  })
  if (!created.success) throw new Error(`kit_write_failed: ${created.error}`)
  return created.data.recordId
}

export async function buildKitForDeck(
  tools: ActionTools,
  deckId: string,
  input: { notes: string; title: string },
): Promise<{ ok: boolean }> {
  const kitId = await upsertKit(tools, deckId, { status: 'generating', statusMessage: 'Writing your study kit…' })
  try {
    const qRes = await tools.query<QuestionRow>('questions', { where: { deckId }, limit: 100 })
    const questions = (qRes.success ? qRes.data.records.map((r) => r.data) : []).sort((a, b) => a.idx - b.idx)
    let kit
    try {
      kit = await generateKit(tools, { notes: input.notes, title: input.title, questions })
    } catch (err) {
      // One retry: long JSON from the model occasionally comes back malformed.
      console.warn(`[kit ${deckId}] first attempt failed, retrying`, err instanceof Error ? err.message : err)
      kit = await generateKit(tools, { notes: input.notes, title: input.title, questions })
    }
    await tools.update('kits', kitId, {
      status: 'ready',
      statusMessage: '',
      summary: kit.summary,
      concepts: JSON.stringify(kit.concepts),
      cheatSheet: JSON.stringify(kit.cheatSheet),
      conceptMap: JSON.stringify(kit.conceptMap),
      questionConcepts: JSON.stringify(kit.questionConcepts),
    })
    return { ok: true }
  } catch (err) {
    console.error(`[kit ${deckId}] failed`, err instanceof Error ? err.message : err)
    await tools.update('kits', kitId, {
      status: 'failed',
      statusMessage: 'The study kit couldn’t be generated. You can try again.',
    })
    return { ok: false }
  }
}

interface DeckRow extends Record<string, unknown> {
  title?: string
  sourceText?: string
}

export async function runGenerateKit(payload: GenerateKitPayload, ctx: JobContext, env: Env) {
  const tools = createActionTools(env, payload.userId, env.APP_OWNER_JWT)
  const got = await tools.get<DeckRow>('decks', payload.deckId)
  if (!got.success) throw new Error(`deck_missing: ${got.error}`)
  ctx.progress(0.1, 'Writing study kit')
  const result = await buildKitForDeck(tools, payload.deckId, {
    notes: got.data.record.data.sourceText ?? '',
    title: got.data.record.data.title ?? '',
  })
  ctx.progress(1, result.ok ? 'Study kit ready' : 'Study kit failed')
  return result
}
