/**
 * Server actions — the only writers of decks, games, players and answers.
 *
 * Actions run with RBAC off (see src/server/action-routes.ts), so every
 * handler here authorizes explicitly: deck actions check the caller owns the
 * deck, game-control actions check the caller is the game's host, and
 * player actions check the caller has joined. Timing and scoring use the
 * worker's clock, never the client's.
 */

import { appFiles, enqueueJob } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  ANSWER_GRACE_MS,
  MAX_SOURCE_CHARS,
  MIN_SOURCE_CHARS,
  OPTION_COUNT,
  clampQuestionCount,
  clampSeconds,
  generateCode,
  isDifficulty,
  isValidCode,
  normalizeCode,
  parseJsonArray,
  rankPlayers,
  scoreAnswer,
  tallyChoices,
  type ReviewItem,
} from '../lib/game-logic'
import { generateRecap, type MissedQuestion } from '../server/ai'
import { upsertKit } from '../server/generate-kit'
import { parseKitField, type KitConcept } from '../lib/kit-logic'

const MAX_PLAYERS = 40
const MAX_ACTIVE_GENERATIONS = 2

// ── row shapes ─────────────────────────────────────────────────────────────

interface DeckRow extends Record<string, unknown> {
  title: string
  status: string
  questionCount: number
  coverUrl?: string
  summary?: string
}
interface QuestionRow extends Record<string, unknown> {
  deckId: string
  idx: number
  prompt: string
  options: string
  correctIndex: number
  explanation: string
  audioUrl?: string
}
interface GameRow extends Record<string, unknown> {
  code: string
  deckId: string
  hostId: string
  title: string
  status: string
  currentIndex: number
  totalQuestions: number
  secondsPerQuestion: number
  questionStartedAt: number
  questionEndsAt: number
  reviewJson?: string
}
interface PlayerRow extends Record<string, unknown> {
  gameId: string
  userId: string
  name: string
  score: number
  streak: number
  correctCount: number
  lastAnsweredIndex: number
  lastPoints: number
}
interface AnswerRow extends Record<string, unknown> {
  gameId: string
  questionIndex: number
  userId: string
  choice: number
  msTaken: number
}

interface KitRow extends Record<string, unknown> {
  deckId: string
  status: string
  statusMessage: string
  summary: string
  concepts: string
  cheatSheet: string
  conceptMap: string
  questionConcepts: string
}

// ── helpers ────────────────────────────────────────────────────────────────

const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })
const fail = (error: string): ActionResult<never> => ({ success: false, error })

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * Wrap a handler so unexpected throws become a clean error result, and stamp
 * successful results with `serverNow` so clients can correct their countdown
 * for clock skew (timers render from server-epoch fields on the game row).
 */
function action(name: string, fn: ActionHandler<Env>): ActionHandler<Env> {
  return async (ctx) => {
    try {
      const result = await fn(ctx)
      if (result.success && result.data && typeof result.data === 'object') {
        return { success: true, data: { ...(result.data as object), serverNow: Date.now() } }
      }
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[action ${name}]`, msg)
      return fail('Something went wrong. Please try again.')
    }
  }
}

async function loadOwnedDeck(tools: ActionTools, deckId: string, userId: string) {
  if (!deckId) return null
  const res = await tools.get<DeckRow>('decks', deckId)
  if (!res.success || res.data.record.createdBy !== userId) return null
  return res.data.record
}

async function loadGame(tools: ActionTools, gameId: string) {
  if (!gameId) return null
  const res = await tools.get<GameRow>('games', gameId)
  return res.success ? res.data.record : null
}

async function loadHostedGame(tools: ActionTools, gameId: string, userId: string) {
  const game = await loadGame(tools, gameId)
  return game && game.data.hostId === userId ? game : null
}

async function loadQuestions(tools: ActionTools, deckId: string) {
  const res = await tools.query<QuestionRow>('questions', { where: { deckId }, limit: 100 })
  if (!res.success) throw new Error(`questions_query_failed: ${res.error}`)
  return res.data.records.map((r) => ({ recordId: r.recordId, ...r.data })).sort((a, b) => a.idx - b.idx)
}

async function loadPlayers(tools: ActionTools, gameId: string) {
  const res = await tools.query<PlayerRow>('players', { where: { gameId }, limit: MAX_PLAYERS + 10 })
  if (!res.success) throw new Error(`players_query_failed: ${res.error}`)
  return res.data.records
}

async function loadKit(tools: ActionTools, deckId: string) {
  const res = await tools.query<KitRow>('kits', { where: { deckId }, limit: 1 })
  return res.success ? res.data.records[0] : undefined
}

async function displayName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  const data = res.success ? res.data.record.data : {}
  const name = str(data.name, 40) || str(data.email, 80).split('@')[0]
  return name || 'Player'
}

/** Copy question `index` onto the game record (without its answer) and start the clock. */
async function openQuestion(tools: ActionTools, gameId: string, game: GameRow, index: number) {
  const res = await tools.query<QuestionRow>('questions', {
    where: { deckId: game.deckId, idx: index },
    limit: 1,
  })
  const q = res.success ? res.data.records[0]?.data : undefined
  if (!q) throw new Error(`question_missing: ${index}`)
  const now = Date.now()
  const limitMs = clampSeconds(game.secondsPerQuestion) * 1000
  const upd = await tools.update('games', gameId, {
    status: 'question',
    currentIndex: index,
    currentPrompt: q.prompt,
    currentOptions: q.options,
    currentAudioUrl: q.audioUrl ?? '',
    questionStartedAt: now,
    questionEndsAt: now + limitMs,
    revealedIndex: -1,
    revealedExplanation: '',
    revealedCounts: '',
  })
  if (!upd.success) throw new Error(`game_update_failed: ${upd.error}`)
}

async function finishGame(tools: ActionTools, gameId: string, game: GameRow) {
  const [questions, kit] = await Promise.all([loadQuestions(tools, game.deckId), loadKit(tools, game.deckId)])
  // Link each question to the study-kit concept it tests (when the kit exists).
  const conceptIds = kit?.data.status === 'ready' ? parseJsonArray<string>(kit.data.questionConcepts) : []
  const review: ReviewItem[] = questions.map((q) => ({
    prompt: q.prompt,
    options: parseJsonArray<string>(q.options),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    conceptId: conceptIds[q.idx] || undefined,
  }))
  const upd = await tools.update('games', gameId, {
    status: 'finished',
    finishedAt: Date.now(),
    reviewJson: JSON.stringify(review),
    currentAudioUrl: '',
  })
  if (!upd.success) throw new Error(`game_update_failed: ${upd.error}`)
}

// ── deck actions ───────────────────────────────────────────────────────────

const createDeck = action('createDeck', async ({ userId, params, tools, env }) => {
  const sourceText = str(params.sourceText, MAX_SOURCE_CHARS)
  if (sourceText.length < MIN_SOURCE_CHARS) {
    return fail(`Add a bit more material — at least ${MIN_SOURCE_CHARS} characters of notes.`)
  }
  const difficulty = isDifficulty(params.difficulty) ? params.difficulty : 'medium'

  // Cap concurrent generations per user so one account can't flood the AI budget.
  const active = await tools.query<DeckRow>('decks', { where: { createdBy: userId }, limit: 200 })
  if (active.success) {
    const busy = active.data.records.filter(
      (r) => r.data.status === 'queued' || r.data.status === 'generating',
    ).length
    if (busy >= MAX_ACTIVE_GENERATIONS) {
      return fail('You already have decks generating. Wait for one to finish first.')
    }
  }

  const created = await tools.create('decks', {
    title: str(params.title, 120),
    sourceName: str(params.sourceName, 200) || 'Pasted notes',
    sourceKey: str(params.sourceKey, 500),
    sourceText,
    questionCount: clampQuestionCount(params.questionCount),
    difficulty,
    narrate: params.narrate === false ? 0 : 1,
    status: 'queued',
    progress: 0,
    statusMessage: 'Queued…',
    summary: '',
    coverUrl: '',
    audioFailures: 0,
  })
  if (!created.success) return fail(created.error ?? 'Could not create deck')
  const deckId = created.data.recordId
  await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, 'generate-deck', { deckId, userId }, {
    maxAttempts: 2,
    enqueuedBy: userId,
  })
  return ok({ deckId })
})

const retryDeck = action('retryDeck', async ({ userId, params, tools, env }) => {
  const deck = await loadOwnedDeck(tools, str(params.deckId), userId)
  if (!deck) return fail('Deck not found')
  if (deck.data.status !== 'failed') return fail('Only failed decks can be retried')
  await tools.update('decks', deck.recordId, { status: 'queued', progress: 0, statusMessage: 'Queued…' })
  await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, 'generate-deck', {
    deckId: deck.recordId,
    userId,
  }, { maxAttempts: 2, enqueuedBy: userId })
  return ok({ deckId: deck.recordId })
})

const deleteDeck = action('deleteDeck', async ({ userId, params, tools, env }) => {
  const deck = await loadOwnedDeck(tools, str(params.deckId), userId)
  if (!deck) return fail('Deck not found')
  if (deck.data.status === 'queued' || deck.data.status === 'generating') {
    return fail('Wait for generation to finish before deleting')
  }
  for (;;) {
    const del = await tools.deleteWhere('questions', { deckId: deck.recordId }, 100)
    if (!del.success || del.data.deleted < 100) break
  }
  await tools.deleteWhere('kits', { deckId: deck.recordId }, 10)
  await tools.remove('decks', deck.recordId)
  // Media cleanup is best effort; orphaned files are harmless.
  try {
    const files = appFiles(env, { scope: 'app', userId })
    const listed = await files.list({ prefix: `decks/${deck.recordId}/`, limit: 100 })
    await Promise.all(listed.files.map((f) => files.delete(f.key)))
  } catch (err) {
    console.warn('[deleteDeck] media cleanup failed', err instanceof Error ? err.message : err)
  }
  return ok({ deleted: true })
})

const createKit = action('createKit', async ({ userId, params, tools, env }) => {
  const deck = await loadOwnedDeck(tools, str(params.deckId), userId)
  if (!deck) return fail('Deck not found')
  if (deck.data.status !== 'ready') return fail('Wait for the quiz to finish first')
  const kit = await loadKit(tools, deck.recordId)
  if (kit?.data.status === 'generating') return ok({ already: true })
  await upsertKit(tools, deck.recordId, { status: 'generating', statusMessage: 'Queued…' })
  await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, 'generate-kit', {
    deckId: deck.recordId,
    userId,
  }, { maxAttempts: 1, enqueuedBy: userId })
  return ok({ queued: true })
})

/**
 * Players read a deck's kit only through this action: the kit is shared
 * once a game they were in has finished (and with the host, who owns it).
 */
const getStudyKit = action('getStudyKit', async ({ userId, params, tools }) => {
  const game = await loadGame(tools, str(params.gameId))
  if (!game) return fail('Game not found')
  if (game.data.hostId !== userId) {
    const pRes = await tools.query<PlayerRow>('players', { where: { gameId: game.recordId, userId }, limit: 1 })
    if (!pRes.success || pRes.data.records.length === 0) return fail('Only players in this game can open its study kit')
    if (game.data.status !== 'finished') return fail('The study kit unlocks when the game ends')
  }
  const kit = await loadKit(tools, game.data.deckId)
  if (!kit || kit.data.status !== 'ready') return fail('This quiz doesn’t have a study kit yet')
  return ok({
    title: game.data.title,
    summary: kit.data.summary,
    concepts: parseKitField<KitConcept[]>(kit.data.concepts, []),
    cheatSheet: parseKitField(kit.data.cheatSheet, []),
    conceptMap: parseKitField(kit.data.conceptMap, { nodes: [], edges: [] }),
  })
})

// ── game lifecycle (host) ──────────────────────────────────────────────────

const hostGame = action('hostGame', async ({ userId, params, tools }) => {
  const deck = await loadOwnedDeck(tools, str(params.deckId), userId)
  if (!deck) return fail('Deck not found')
  if (deck.data.status !== 'ready') return fail('This deck is not ready yet')
  const questions = await loadQuestions(tools, deck.recordId)
  if (questions.length === 0) return fail('This deck has no questions')

  let code = ''
  for (let i = 0; i < 8 && !code; i++) {
    const candidate = generateCode()
    const clash = await tools.query('games', { where: { code: candidate }, limit: 1 })
    if (clash.success && clash.data.records.length === 0) code = candidate
  }
  if (!code) return fail('Could not allocate a join code, try again')

  const created = await tools.create('games', {
    code,
    deckId: deck.recordId,
    hostId: userId,
    hostName: await displayName(tools, userId),
    title: deck.data.title || 'Quiz',
    coverUrl: deck.data.coverUrl ?? '',
    status: 'lobby',
    currentIndex: -1,
    totalQuestions: questions.length,
    secondsPerQuestion: clampSeconds(params.secondsPerQuestion),
    questionStartedAt: 0,
    questionEndsAt: 0,
    currentPrompt: '',
    currentOptions: '',
    currentAudioUrl: '',
    revealedIndex: -1,
    revealedExplanation: '',
    revealedCounts: '',
    reviewJson: '',
    finishedAt: 0,
  })
  if (!created.success) return fail(created.error ?? 'Could not create game')
  return ok({ gameId: created.data.recordId, code })
})

const startGame = action('startGame', async ({ userId, params, tools }) => {
  const game = await loadHostedGame(tools, str(params.gameId), userId)
  if (!game) return fail('Game not found')
  if (game.data.status !== 'lobby') return fail('Game already started')
  const players = await loadPlayers(tools, game.recordId)
  if (players.length === 0) return fail('Wait for at least one player to join')
  await openQuestion(tools, game.recordId, game.data, 0)
  return ok({ started: true })
})

const revealAnswer = action('revealAnswer', async ({ userId, params, tools }) => {
  const game = await loadHostedGame(tools, str(params.gameId), userId)
  if (!game) return fail('Game not found')
  const index = Number(params.questionIndex)
  // Idempotent: a duplicate reveal (double click, timer + "all answered"
  // firing together) is a no-op, never a double score.
  if (game.data.status === 'reveal' && game.data.currentIndex === index) return ok({ already: true })
  if (game.data.status !== 'question' || game.data.currentIndex !== index) {
    return fail('That question is not open')
  }

  const qRes = await tools.query<QuestionRow>('questions', {
    where: { deckId: game.data.deckId, idx: index },
    limit: 1,
  })
  const question = qRes.success ? qRes.data.records[0]?.data : undefined
  if (!question) return fail('Question missing')

  const [answersRes, players] = await Promise.all([
    tools.query<AnswerRow>('answers', { where: { gameId: game.recordId, questionIndex: index }, limit: 500 }),
    loadPlayers(tools, game.recordId),
  ])
  const answers = answersRes.success ? answersRes.data.records.map((r) => r.data) : []
  const byUser = new Map(answers.map((a) => [a.userId, a]))
  const limitMs = clampSeconds(game.data.secondsPerQuestion) * 1000

  // Mark the question revealed first so late submissions are refused while
  // the player rows are being scored.
  const upd = await tools.update('games', game.recordId, {
    status: 'reveal',
    revealedIndex: question.correctIndex,
    revealedExplanation: question.explanation,
    revealedCounts: JSON.stringify(tallyChoices(answers.map((a) => a.choice))),
  })
  if (!upd.success) return fail(upd.error ?? 'Could not reveal')

  await Promise.all(
    players.map(async (p) => {
      const a = byUser.get(p.data.userId)
      const correct = !!a && a.choice === question.correctIndex
      const points = a
        ? scoreAnswer({ correct, msTaken: a.msTaken, limitMs, streakBefore: p.data.streak || 0 })
        : 0
      const patch = {
        score: (p.data.score || 0) + points,
        streak: correct ? (p.data.streak || 0) + 1 : 0,
        correctCount: (p.data.correctCount || 0) + (correct ? 1 : 0),
        lastPoints: points,
      }
      // Skip a write when nothing changes (no answer, no streak to reset).
      if (!a && !p.data.streak && !p.data.lastPoints) return
      await tools.update('players', p.recordId, patch)
    }),
  )
  return ok({ revealed: true })
})

const nextQuestion = action('nextQuestion', async ({ userId, params, tools }) => {
  const game = await loadHostedGame(tools, str(params.gameId), userId)
  if (!game) return fail('Game not found')
  if (game.data.status !== 'reveal') return fail('Reveal the answer first')
  const next = game.data.currentIndex + 1
  if (next >= game.data.totalQuestions) {
    await finishGame(tools, game.recordId, game.data)
    return ok({ finished: true })
  }
  await openQuestion(tools, game.recordId, game.data, next)
  return ok({ index: next })
})

const endGame = action('endGame', async ({ userId, params, tools }) => {
  const game = await loadHostedGame(tools, str(params.gameId), userId)
  if (!game) return fail('Game not found')
  if (game.data.status === 'finished') return ok({ finished: true })
  await finishGame(tools, game.recordId, game.data)
  return ok({ finished: true })
})

// ── player actions ─────────────────────────────────────────────────────────

const joinGame = action('joinGame', async ({ userId, params, tools }) => {
  const code = normalizeCode(str(params.code, 20))
  if (!isValidCode(code)) return fail('That code doesn’t look right — it’s 6 letters/numbers')
  const res = await tools.query<GameRow>('games', { where: { code }, limit: 1 })
  const game = res.success ? res.data.records[0] : undefined
  if (!game) return fail('No game with that code')
  if (game.data.hostId === userId) return ok({ gameId: game.recordId, role: 'host' as const })

  const players = await loadPlayers(tools, game.recordId)
  if (players.some((p) => p.data.userId === userId)) {
    return ok({ gameId: game.recordId, role: 'player' as const })
  }
  if (game.data.status === 'finished') return fail('That game has already ended')
  if (players.length >= MAX_PLAYERS) return fail('This game is full')

  const created = await tools.create('players', {
    gameId: game.recordId,
    userId,
    name: await displayName(tools, userId),
    score: 0,
    streak: 0,
    correctCount: 0,
    lastAnsweredIndex: -1,
    lastPoints: 0,
  })
  // A unique-constraint clash means a concurrent join already added us.
  if (!created.success && !/unique|exists|duplicate/i.test(created.error ?? '')) {
    return fail(created.error ?? 'Could not join')
  }
  return ok({ gameId: game.recordId, role: 'player' as const })
})

const submitAnswer = action('submitAnswer', async ({ userId, params, tools }) => {
  const now = Date.now()
  const game = await loadGame(tools, str(params.gameId))
  if (!game) return fail('Game not found')
  const index = Number(params.questionIndex)
  const choice = Number(params.choice)
  if (!Number.isInteger(choice) || choice < 0 || choice >= OPTION_COUNT) return fail('Invalid choice')
  if (game.data.status !== 'question' || game.data.currentIndex !== index) {
    return fail('Too late — this question is closed')
  }
  if (now > game.data.questionEndsAt + ANSWER_GRACE_MS) return fail('Time’s up!')

  const pRes = await tools.query<PlayerRow>('players', {
    where: { gameId: game.recordId, userId },
    limit: 1,
  })
  const player = pRes.success ? pRes.data.records[0] : undefined
  if (!player) return fail('Join the game first')
  if (player.data.lastAnsweredIndex === index) return fail('You already answered')

  const created = await tools.create('answers', {
    gameId: game.recordId,
    questionIndex: index,
    userId,
    choice,
    msTaken: Math.max(0, now - game.data.questionStartedAt),
  })
  if (!created.success) {
    return fail(/unique|exists|duplicate/i.test(created.error ?? '') ? 'You already answered' : 'Could not save answer')
  }
  await tools.update('players', player.recordId, { lastAnsweredIndex: index })
  return ok({ locked: true })
})

const getRecap = action('getRecap', async ({ userId, params, tools }) => {
  const game = await loadGame(tools, str(params.gameId))
  if (!game) return fail('Game not found')
  if (game.data.status !== 'finished') return fail('Recaps are available when the game ends')

  const existing = await tools.query<{ text: string }>('recaps', {
    where: { gameId: game.recordId, userId },
    limit: 1,
  })
  const cached = existing.success ? existing.data.records[0]?.data.text : undefined
  if (cached) return ok({ text: cached })

  const players = await loadPlayers(tools, game.recordId)
  const me = players.find((p) => p.data.userId === userId)
  if (!me) return fail('Only players get a recap')

  const review = parseJsonArray<ReviewItem>(game.data.reviewJson)
  const answersRes = await tools.query<AnswerRow>('answers', {
    where: { gameId: game.recordId, userId },
    limit: 100,
  })
  const myAnswers = new Map(
    (answersRes.success ? answersRes.data.records : []).map((r) => [r.data.questionIndex, r.data.choice]),
  )
  // Only questions that were actually played (the host may end early).
  const played = review.slice(0, Math.max(0, game.data.currentIndex + 1))
  const kit = await loadKit(tools, game.data.deckId)
  const conceptTerms = new Map(
    parseKitField<KitConcept[]>(kit?.data.concepts, []).map((c) => [c.id, c.term]),
  )
  const missed: MissedQuestion[] = []
  played.forEach((q, i) => {
    const choice = myAnswers.get(i)
    if (choice === q.correctIndex) return
    missed.push({
      concept: q.conceptId ? conceptTerms.get(q.conceptId) : undefined,
      prompt: q.prompt,
      yourAnswer: choice === undefined ? null : (q.options[choice] ?? null),
      correctAnswer: q.options[q.correctIndex] ?? '',
      explanation: q.explanation,
    })
  })
  const ranked = rankPlayers(
    players.map((p) => ({
      userId: p.data.userId,
      name: p.data.name,
      score: p.data.score || 0,
      correctCount: p.data.correctCount || 0,
    })),
  )
  const deck = await tools.get<DeckRow>('decks', game.data.deckId)
  const text = await generateRecap(tools, {
    title: game.data.title,
    summary: deck.success ? (deck.data.record.data.summary ?? '') : '',
    name: me.data.name,
    total: played.length,
    correct: played.length - missed.length,
    rank: ranked.find((p) => p.userId === userId)?.rank ?? players.length,
    players: players.length,
    missed,
  })
  await tools.create('recaps', { gameId: game.recordId, userId, text: text.slice(0, 8000) })
  return ok({ text })
})

export const actions: Record<string, ActionHandler<Env>> = {
  createDeck,
  retryDeck,
  deleteDeck,
  createKit,
  getStudyKit,
  hostGame,
  startGame,
  revealAnswer,
  nextQuestion,
  endGame,
  joinGame,
  submitAnswer,
  getRecap,
}
