/**
 * Pure game rules shared by the worker (authoritative) and the client
 * (display only). No SDK imports, so this file is unit-tested directly.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1
export const CODE_LENGTH = 6
export const OPTION_COUNT = 4
export const MIN_QUESTIONS = 5
export const MAX_QUESTIONS = 15
export const DEFAULT_SECONDS = 20
export const ANSWER_GRACE_MS = 1500
export const MAX_SOURCE_CHARS = 60000
export const MIN_SOURCE_CHARS = 200

export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameStatus = 'lobby' | 'question' | 'reveal' | 'finished'

export interface QuizQuestion {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface GeneratedQuiz {
  title: string
  summary: string
  questions: QuizQuestion[]
}

export function generateCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false
  return true
}

/**
 * Points for one answer. Correct answers earn 500 base plus up to 500 for
 * speed, plus a streak bonus of 100 per consecutive correct answer before
 * this one (capped at 300). Wrong or missing answers earn nothing.
 */
export function scoreAnswer(opts: {
  correct: boolean
  msTaken: number
  limitMs: number
  streakBefore: number
}): number {
  if (!opts.correct) return 0
  const limit = Math.max(1, opts.limitMs)
  const taken = Math.min(Math.max(0, opts.msTaken), limit)
  const speed = Math.round(500 * (1 - taken / limit))
  const streakBonus = Math.min(300, Math.max(0, opts.streakBefore) * 100)
  return 500 + speed + streakBonus
}

export function clampQuestionCount(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 10
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, v))
}

export function clampSeconds(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_SECONDS
  return Math.min(60, Math.max(10, v))
}

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'medium' || v === 'hard'
}

/** Pull the first top-level JSON object out of model output (which may be
 *  wrapped in prose or a ```json fence). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('quiz_parse_failed: no JSON object')
  return JSON.parse(text.slice(start, end + 1))
}

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * Validate and normalize a model-produced quiz. Drops malformed questions
 * rather than failing the whole deck, and throws only if too few survive.
 */
export function validateQuiz(raw: unknown, wanted: number): GeneratedQuiz {
  if (!raw || typeof raw !== 'object') throw new Error('quiz_parse_failed: not an object')
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.questions) ? obj.questions : []
  const seen = new Set<string>()
  const questions: QuizQuestion[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const q = item as Record<string, unknown>
    const prompt = cleanText(q.prompt, 600)
    const options = Array.isArray(q.options) ? q.options.map((o) => cleanText(o, 200)) : []
    const correctIndex = Number(q.correctIndex)
    if (!prompt || options.length !== OPTION_COUNT) continue
    if (options.some((o) => !o)) continue
    if (new Set(options.map((o) => o.toLowerCase())).size !== OPTION_COUNT) continue
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= OPTION_COUNT) continue
    const key = prompt.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    questions.push({ prompt, options, correctIndex, explanation: cleanText(q.explanation, 1000) })
    if (questions.length >= wanted) break
  }
  const minimum = Math.min(wanted, Math.max(3, Math.ceil(wanted / 2)))
  if (questions.length < minimum) {
    throw new Error(`quiz_parse_failed: only ${questions.length} valid questions`)
  }
  return {
    title: cleanText(obj.title, 120) || 'Untitled quiz',
    summary: cleanText(obj.summary, 400),
    questions,
  }
}

/** Shuffle options so the right answer isn't biased to one position, and
 *  remap correctIndex to follow it. */
export function shuffleOptions(q: QuizQuestion, random: () => number = Math.random): QuizQuestion {
  const order = q.options.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
  }
}

export function parseJsonArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (typeof v !== 'string' || !v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export interface RankedPlayer {
  userId: string
  name: string
  score: number
  correctCount: number
}

/** Sort by score, then correct answers, then name; ties share a rank. */
export function rankPlayers<T extends RankedPlayer>(players: T[]): Array<T & { rank: number }> {
  const sorted = [...players].sort(
    (a, b) =>
      b.score - a.score || b.correctCount - a.correctCount || a.name.localeCompare(b.name),
  )
  let rank = 0
  let prevScore: number | null = null
  return sorted.map((p, i) => {
    if (prevScore === null || p.score !== prevScore) rank = i + 1
    prevScore = p.score
    return { ...p, rank }
  })
}

/** Tally how many players picked each option. */
export function tallyChoices(choices: number[]): number[] {
  const counts = new Array(OPTION_COUNT).fill(0) as number[]
  for (const c of choices) if (Number.isInteger(c) && c >= 0 && c < OPTION_COUNT) counts[c]++
  return counts
}

export interface ReviewItem {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}
