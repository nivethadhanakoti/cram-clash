/**
 * Plays whole games through the real action handlers against an in-memory
 * stand-in for the RecordRoom tools API. Integrations, job enqueueing and
 * file storage are faked; everything else (authorization, timing, scoring,
 * state machine) is the production code path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult, ActionTools } from 'deepspace/worker'

vi.mock('deepspace/worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('deepspace/worker')>()
  return {
    ...actual,
    enqueueJob: vi.fn(async () => 'job_1'),
    appFiles: vi.fn(() => ({ list: async () => ({ files: [] }), delete: async () => ({ existed: false }) })),
  }
})

import { enqueueJob } from 'deepspace/worker'
import { actions } from './index'
import { schemas } from '../schemas'
import { buildKitForDeck } from '../server/generate-kit'

// ── in-memory RecordRoom ──────────────────────────────────────────────────

interface Row {
  recordId: string
  data: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

function createStore() {
  const tables = new Map<string, Map<string, Row>>()
  let seq = 0
  const table = (c: string) => {
    if (!tables.has(c)) tables.set(c, new Map())
    return tables.get(c)!
  }
  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) =>
      k === 'createdBy' ? row.createdBy === v : k === 'recordId' ? row.recordId === v : row.data[k] === v,
    )
  const integration = vi.fn(async (endpoint: string): Promise<ActionResult<unknown>> => {
    if (endpoint === 'anthropic/chat-completion') {
      return { success: true, data: { content: [{ type: 'text', text: 'Great game. Review oxygen.' }] } }
    }
    return { success: false, error: 'not faked' }
  })

  function toolsFor(userId: string): ActionTools {
    const ok = <T>(data: T) => ({ success: true as const, data })
    return {
      async create(collection, data, recordId) {
        const schema = schemas.find((s) => s.name === collection)
        for (const existing of table(collection).values()) {
          if (schema?.uniqueOn?.length && schema.uniqueOn.every((k) => existing.data[k] === (data as Record<string, unknown>)[k])) {
            return { success: false, error: 'UNIQUE constraint failed' }
          }
        }
        const id = recordId ?? `${collection}_${++seq}`
        const now = new Date().toISOString()
        table(collection).set(id, { recordId: id, data: { ...data }, createdBy: userId, createdAt: now, updatedAt: now })
        return ok({ recordId: id })
      },
      async update(collection, recordId, patch) {
        const row = table(collection).get(recordId)
        if (!row) return { success: false, error: 'not found' }
        row.data = { ...row.data, ...patch }
        row.updatedAt = new Date().toISOString()
        return ok({ recordId })
      },
      async remove(collection, recordId) {
        table(collection).delete(recordId)
        return ok({ recordId })
      },
      async deleteWhere(collection, where, limit = 100) {
        let deleted = 0
        for (const [id, row] of table(collection)) {
          if (deleted >= limit) break
          if (matches(row, where)) {
            table(collection).delete(id)
            deleted++
          }
        }
        return ok({ deleted })
      },
      async get(collection, recordId) {
        const row = table(collection).get(recordId)
        if (!row) return { success: false, error: 'not found' }
        return ok({ record: structuredClone(row) }) as never
      },
      async query(collection, options) {
        const rows = [...table(collection).values()].filter((r) => matches(r, options?.where))
        return ok({ records: structuredClone(rows.slice(0, options?.limit ?? 50)), count: rows.length }) as never
      },
      integration: integration as ActionTools['integration'],
      async registerUser() {
        return ok({}) as never
      },
    }
  }
  return { table, toolsFor, integration }
}

const env = { JOB_ROOMS: {}, DEEPSPACE_APP_ID: 'app_test', OWNER_USER_ID: 'owner' } as never

let store: ReturnType<typeof createStore>

async function call<T = Record<string, unknown>>(name: string, userId: string, params: Record<string, unknown>) {
  const res = await actions[name]({ userId, params, tools: store.toolsFor(userId), env, callerJwt: 'jwt' })
  return res as ActionResult<T & { serverNow: number }>
}

function expectOk<T>(res: ActionResult<T>): T {
  if (!res.success) throw new Error(`expected success, got: ${res.error}`)
  return res.data
}

/** A ready deck with 3 questions whose correct answers are 0, 1, 2. */
async function seedDeck(owner: string) {
  const tools = store.toolsFor(owner)
  const deck = await tools.create('decks', { title: 'Cells', status: 'ready', questionCount: 3, coverUrl: '', summary: 'About cells' })
  const deckId = (deck as { data: { recordId: string } }).data.recordId
  for (let idx = 0; idx < 3; idx++) {
    await tools.create('questions', {
      deckId,
      idx,
      prompt: `Q${idx}?`,
      options: JSON.stringify(['a', 'b', 'c', 'd'].map((o) => `${o}${idx}`)),
      correctIndex: idx,
      explanation: `because ${idx}`,
      audioUrl: '',
    })
  }
  return deckId
}

function game(gameId: string) {
  return store.table('games').get(gameId)!.data
}
function player(gameId: string, userId: string) {
  return [...store.table('players').values()].find((p) => p.data.gameId === gameId && p.data.userId === userId)!.data
}

beforeEach(() => {
  store = createStore()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
  for (const [id, name] of [['host', 'Host'], ['ann', 'Ann'], ['bob', 'Bob'], ['cat', 'Cat']]) {
    store.table('users').set(id, { recordId: id, data: { name, email: `${id}@x.com` }, createdBy: id, createdAt: '', updatedAt: '' })
  }
})
afterEach(() => {
  vi.useRealTimers()
})

describe('full game', () => {
  it('runs lobby → questions → reveal → finish with server-side scoring', async () => {
    const deckId = await seedDeck('host')
    const { gameId, code } = expectOk(await call<{ gameId: string; code: string }>('hostGame', 'host', { deckId, secondsPerQuestion: 20 }))
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(game(gameId).status).toBe('lobby')

    // Cannot start with nobody in the lobby.
    expect((await call('startGame', 'host', { gameId })).success).toBe(false)

    for (const u of ['ann', 'bob', 'cat']) expectOk(await call('joinGame', u, { code: code.toLowerCase() }))
    // Joining twice is a no-op; the host "joining" is recognized as host.
    expectOk(await call('joinGame', 'ann', { code }))
    expect(expectOk(await call<{ role: string }>('joinGame', 'host', { code })).role).toBe('host')
    expect([...store.table('players').values()]).toHaveLength(3)
    expect(player(gameId, 'ann').name).toBe('Ann')

    // Only the host controls the game.
    expect((await call('startGame', 'ann', { gameId })).success).toBe(false)
    expectOk(await call('startGame', 'host', { gameId }))
    const g0 = game(gameId)
    expect(g0.status).toBe('question')
    expect(g0.currentIndex).toBe(0)
    expect(g0.currentPrompt).toBe('Q0?')
    // The live question never carries its answer.
    expect(g0.revealedIndex).toBe(-1)
    expect(JSON.stringify(g0)).not.toContain('because 0')

    // Q0 (answer 0): Ann right instantly, Bob right at 10s, Cat wrong.
    expectOk(await call('submitAnswer', 'ann', { gameId, questionIndex: 0, choice: 0 }))
    vi.advanceTimersByTime(10_000)
    expectOk(await call('submitAnswer', 'bob', { gameId, questionIndex: 0, choice: 0 }))
    expectOk(await call('submitAnswer', 'cat', { gameId, questionIndex: 0, choice: 3 }))
    // No double answers, no answers to other questions, no bad choices.
    expect((await call('submitAnswer', 'ann', { gameId, questionIndex: 0, choice: 1 })).success).toBe(false)
    expect((await call('submitAnswer', 'ann', { gameId, questionIndex: 1, choice: 1 })).success).toBe(false)
    expect((await call('submitAnswer', 'bob', { gameId, questionIndex: 0, choice: 7 })).success).toBe(false)
    // Scores are not touched until the reveal.
    expect(player(gameId, 'ann').score).toBe(0)
    expect(player(gameId, 'ann').lastAnsweredIndex).toBe(0)

    // Players cannot reveal; host can, and a duplicate reveal is harmless.
    expect((await call('revealAnswer', 'ann', { gameId, questionIndex: 0 })).success).toBe(false)
    expectOk(await call('revealAnswer', 'host', { gameId, questionIndex: 0 }))
    expectOk(await call('revealAnswer', 'host', { gameId, questionIndex: 0 }))
    expect(game(gameId).status).toBe('reveal')
    expect(game(gameId).revealedIndex).toBe(0)
    expect(JSON.parse(game(gameId).revealedCounts as string)).toEqual([2, 0, 0, 1])
    expect(player(gameId, 'ann').score).toBe(1000) // instant, no streak
    expect(player(gameId, 'bob').score).toBe(750) // half time
    expect(player(gameId, 'cat').score).toBe(0)
    expect(player(gameId, 'ann').streak).toBe(1)

    // Answers after the reveal are refused.
    expect((await call('submitAnswer', 'cat', { gameId, questionIndex: 0, choice: 0 })).success).toBe(false)

    // Q1 (answer 1): Ann right again (streak bonus), Bob silent, Cat too late.
    expectOk(await call('nextQuestion', 'host', { gameId }))
    expect(game(gameId).currentIndex).toBe(1)
    expectOk(await call('submitAnswer', 'ann', { gameId, questionIndex: 1, choice: 1 }))
    vi.advanceTimersByTime(25_000) // 20s limit + 1.5s grace has passed
    expect((await call('submitAnswer', 'cat', { gameId, questionIndex: 1, choice: 1 })).success).toBe(false)
    expectOk(await call('revealAnswer', 'host', { gameId, questionIndex: 1 }))
    expect(player(gameId, 'ann').score).toBe(1000 + 1100)
    expect(player(gameId, 'ann').streak).toBe(2)
    expect(player(gameId, 'bob').streak).toBe(0) // missed → streak reset
    expect(player(gameId, 'bob').lastPoints).toBe(0)

    // Q2, then the final "next" finishes the game and publishes the review.
    expectOk(await call('nextQuestion', 'host', { gameId }))
    expectOk(await call('submitAnswer', 'bob', { gameId, questionIndex: 2, choice: 2 }))
    expectOk(await call('revealAnswer', 'host', { gameId, questionIndex: 2 }))
    expect(expectOk(await call<{ finished: boolean }>('nextQuestion', 'host', { gameId })).finished).toBe(true)
    expect(game(gameId).status).toBe('finished')
    const review = JSON.parse(game(gameId).reviewJson as string)
    expect(review).toHaveLength(3)
    expect(review[2].correctIndex).toBe(2)

    // Joining a finished game is refused for newcomers.
    store.table('users').set('dan', { recordId: 'dan', data: { name: 'Dan' }, createdBy: 'dan', createdAt: '', updatedAt: '' })
    expect((await call('joinGame', 'dan', { code })).success).toBe(false)

    // Recap: generated once from Bob's misses, cached on the second call.
    const recap = expectOk(await call<{ text: string }>('getRecap', 'bob', { gameId }))
    expect(recap.text).toContain('Review oxygen')
    const prompt = JSON.stringify(store.integration.mock.calls.at(-1))
    expect(prompt).toContain('Q1?') // Bob missed Q1
    expect(prompt).toContain('no answer')
    expect(prompt).not.toContain('Q0?') // Bob got Q0 right
    expectOk(await call('getRecap', 'bob', { gameId }))
    expect(store.integration).toHaveBeenCalledTimes(1)
    expect((await call('getRecap', 'host', { gameId })).success).toBe(false) // host isn't a player
  })

  it('stamps serverNow on results for client clock-skew correction', async () => {
    const deckId = await seedDeck('host')
    const res = expectOk(await call('hostGame', 'host', { deckId }))
    expect(res.serverNow).toBe(Date.now())
  })

  it('ending early publishes only the questions that were played', async () => {
    const deckId = await seedDeck('host')
    const { gameId, code } = expectOk(await call<{ gameId: string; code: string }>('hostGame', 'host', { deckId }))
    expectOk(await call('joinGame', 'ann', { code }))
    expectOk(await call('startGame', 'host', { gameId }))
    expectOk(await call('endGame', 'host', { gameId }))
    expect(game(gameId).status).toBe('finished')
    expectOk(await call('getRecap', 'ann', { gameId }))
    const prompt = JSON.stringify(store.integration.mock.calls.at(-1))
    expect(prompt).toContain('0/1 correct')
  })
})

describe('deck authorization', () => {
  it('only the owner can host, retry or delete a deck', async () => {
    const deckId = await seedDeck('host')
    expect((await call('hostGame', 'ann', { deckId })).success).toBe(false)
    expect((await call('deleteDeck', 'ann', { deckId })).success).toBe(false)
    expect((await call('retryDeck', 'ann', { deckId })).success).toBe(false)
    expectOk(await call('deleteDeck', 'host', { deckId }))
    expect(store.table('questions').size).toBe(0)
    expect(store.table('decks').size).toBe(0)
  })

  it('rejects notes that are too short and caps concurrent generations', async () => {
    expect((await call('createDeck', 'ann', { sourceText: 'too short' })).success).toBe(false)
    const notes = 'Photosynthesis converts light energy into chemical energy. '.repeat(10)
    expectOk(await call('createDeck', 'ann', { sourceText: notes }))
    expectOk(await call('createDeck', 'ann', { sourceText: notes }))
    const third = await call('createDeck', 'ann', { sourceText: notes })
    expect(third.success).toBe(false)
    // A different user is unaffected.
    expectOk(await call('createDeck', 'bob', { sourceText: notes }))
    const deck = [...store.table('decks').values()][0].data
    expect(deck.status).toBe('queued')
    expect(deck.questionCount).toBe(10)
  })

  it('a deck that is not ready cannot be hosted', async () => {
    const tools = store.toolsFor('host')
    const res = await tools.create('decks', { title: 'x', status: 'generating' })
    const deckId = (res as { data: { recordId: string } }).data.recordId
    expect((await call('hostGame', 'host', { deckId })).success).toBe(false)
  })
})

describe('join codes', () => {
  it('rejects malformed and unknown codes with a clear message', async () => {
    const bad = await call('joinGame', 'ann', { code: 'abc' })
    expect(bad.success).toBe(false)
    const unknown = await call('joinGame', 'ann', { code: 'ZZZZZZ' })
    expect(unknown.success).toBe(false)
    if (!unknown.success) expect(unknown.error).toMatch(/No game/)
  })
})

// ── study kit ──────────────────────────────────────────────────────────────

const KIT_JSON = {
  summary: 'Cells make energy.',
  concepts: [
    { id: 'zero', term: 'Concept Zero', explanation: 'First idea.', example: '' },
    { id: 'one', term: 'Concept One', explanation: 'Second idea.', example: 'e.g.' },
  ],
  cheatSheet: [{ heading: 'Facts', items: ['a = b'] }],
  conceptMap: { nodes: [{ id: 'zero', label: 'Zero' }, { id: 'one', label: 'One' }], edges: [{ from: 'zero', to: 'one', label: 'leads to' }] },
  questionConcepts: ['zero', 'one', ''],
}

async function seedKit(owner: string, deckId: string) {
  await store.toolsFor(owner).create('kits', {
    deckId,
    status: 'ready',
    statusMessage: '',
    summary: KIT_JSON.summary,
    concepts: JSON.stringify([
      { id: 'concept-zero', term: 'Concept Zero', explanation: 'First idea.', example: '' },
      { id: 'concept-one', term: 'Concept One', explanation: 'Second idea.', example: '' },
    ]),
    cheatSheet: JSON.stringify(KIT_JSON.cheatSheet),
    conceptMap: JSON.stringify({ nodes: [], edges: [] }),
    questionConcepts: JSON.stringify(['concept-zero', 'concept-one', '']),
  })
}

async function playedGame() {
  const deckId = await seedDeck('host')
  await seedKit('host', deckId)
  const { gameId, code } = expectOk(await call<{ gameId: string; code: string }>('hostGame', 'host', { deckId }))
  expectOk(await call('joinGame', 'ann', { code }))
  expectOk(await call('startGame', 'host', { gameId }))
  return { deckId, gameId }
}

describe('study kit', () => {
  it('links each reviewed question to its concept when the game ends', async () => {
    const { gameId } = await playedGame()
    expectOk(await call('endGame', 'host', { gameId }))
    const review = JSON.parse(game(gameId).reviewJson as string)
    expect(review.map((r: { conceptId?: string }) => r.conceptId)).toEqual(['concept-zero', 'concept-one', undefined])
  })

  it('opens for players only after the game ends, never for outsiders', async () => {
    const { gameId } = await playedGame()
    const early = await call('getStudyKit', 'ann', { gameId })
    expect(early.success).toBe(false)
    expectOk(await call('endGame', 'host', { gameId }))
    expect((await call('getStudyKit', 'bob', { gameId })).success).toBe(false) // never joined
    const kit = expectOk(await call<{ concepts: Array<{ term: string }>; summary: string }>('getStudyKit', 'ann', { gameId }))
    expect(kit.summary).toBe('Cells make energy.')
    expect(kit.concepts.map((c) => c.term)).toEqual(['Concept Zero', 'Concept One'])
  })

  it('the host can open their own kit mid-game', async () => {
    const { gameId } = await playedGame()
    expectOk(await call('getStudyKit', 'host', { gameId }))
  })

  it('names the missed concept in the recap prompt', async () => {
    const { gameId } = await playedGame()
    expectOk(await call('submitAnswer', 'ann', { gameId, questionIndex: 0, choice: 3 })) // wrong
    expectOk(await call('revealAnswer', 'host', { gameId, questionIndex: 0 }))
    expectOk(await call('endGame', 'host', { gameId }))
    expectOk(await call('getRecap', 'ann', { gameId }))
    expect(JSON.stringify(store.integration.mock.calls.at(-1))).toContain('[Concept: Concept Zero]')
  })

  it('only the owner can (re)generate a kit, and deleting the deck removes it', async () => {
    const deckId = await seedDeck('host')
    expect((await call('createKit', 'ann', { deckId })).success).toBe(false)
    expectOk(await call('createKit', 'host', { deckId }))
    const kitRow = [...store.table('kits').values()][0].data
    expect(kitRow.status).toBe('generating')
    expect(vi.mocked(enqueueJob).mock.calls.at(-1)?.[2]).toBe('generate-kit')
    expectOk(await call('deleteDeck', 'host', { deckId }))
    expect(store.table('kits').size).toBe(0)
  })
})

describe('buildKitForDeck', () => {
  it('writes a validated kit from the model output', async () => {
    const deckId = await seedDeck('host')
    store.integration.mockImplementation(async () => ({
      success: true,
      data: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(KIT_JSON) + '\n```' }] },
    }))
    const res = await buildKitForDeck(store.toolsFor('host'), deckId, { notes: 'notes', title: 'Cells' })
    expect(res.ok).toBe(true)
    const kit = [...store.table('kits').values()][0].data
    expect(kit.status).toBe('ready')
    expect(JSON.parse(kit.questionConcepts as string)).toEqual(['concept-zero', 'concept-one', ''])
    const prompt = JSON.stringify(store.integration.mock.calls[0])
    expect(prompt).toContain('Q0?') // quiz questions are sent for concept mapping
  })

  it('retries once, then marks the kit failed without throwing', async () => {
    const deckId = await seedDeck('host')
    store.integration.mockImplementation(async () => ({ success: true, data: { content: [{ type: 'text', text: 'not json' }] } }))
    const res = await buildKitForDeck(store.toolsFor('host'), deckId, { notes: 'notes', title: 'Cells' })
    expect(res.ok).toBe(false)
    expect(store.integration).toHaveBeenCalledTimes(2)
    expect([...store.table('kits').values()][0].data.status).toBe('failed')
  })
})
