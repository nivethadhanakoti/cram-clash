/**
 * Integration calls: Anthropic (quiz + recap), ElevenLabs (narration),
 * Gemini (cover art). All run server-side through the platform integration
 * proxy, billed to the app owner — no API keys live in this app.
 */

import type { ActionTools } from 'deepspace/worker'
import {
  extractJsonObject,
  shuffleOptions,
  validateQuiz,
  type Difficulty,
  type GeneratedQuiz,
} from '../lib/game-logic'
import { validateKit, type StudyKit } from '../lib/kit-logic'

export const QUIZ_MODEL = 'claude-haiku-4-5'
export const TTS_MODEL = 'eleven_flash_v2_5'
// Same voice id DeepSpace's StoryNest example ships with, so it is known to
// work through the platform's ElevenLabs proxy.
export const TTS_VOICE_ID = 'WdZjiN0nNcik2LBjOHiv'
export const TTS_OUTPUT_FORMAT = 'mp3_44100_128'
export const IMAGE_MODEL = 'gemini-2.5-flash-image'

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
}

/** Some proxies wrap the provider body in `{ response }`; accept both. */
function unwrap<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'response' in data) {
    return (data as { response: T }).response
  }
  return data as T
}

async function claude(tools: ActionTools, system: string, user: string, maxTokens: number) {
  const result = await tools.integration<AnthropicResponse>('anthropic/chat-completion', {
    model: QUIZ_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (!result.success) throw new Error(`anthropic_failed: ${result.error ?? 'unknown'}`)
  const text = unwrap<AnthropicResponse>(result.data)?.content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('anthropic_failed: empty response')
  return text
}

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  easy: 'Test recall of key definitions and facts stated directly in the notes.',
  medium: 'Mix recall with understanding: why things happen, how ideas connect, simple application.',
  hard: 'Favor application and analysis: scenarios, comparisons, and common misconceptions. Distractors should be genuinely tempting.',
}

export function quizSystemPrompt(): string {
  return [
    'You write multiple-choice quiz questions for students studying their own notes.',
    'Rules:',
    '- Every question must be answerable from the provided notes alone. Never test trivia that is not in the notes.',
    '- Exactly 4 options per question, exactly one correct. Options must be distinct, similar in length and style, and plausible.',
    '- Never use "all of the above", "none of the above", or "both A and B".',
    '- Keep prompts under 200 characters and options under 90 characters so they fit on a phone.',
    '- The explanation (1–2 sentences) says why the answer is right, referencing the notes.',
    '- Cover the breadth of the notes; do not cluster on one section.',
    'Respond with ONLY a JSON object, no prose, in this shape:',
    '{"title": string (short, topic-based), "summary": string (one sentence describing what the notes cover),',
    ' "questions": [{"prompt": string, "options": [string, string, string, string], "correctIndex": 0-3, "explanation": string}]}',
  ].join('\n')
}

export async function generateQuiz(
  tools: ActionTools,
  input: { notes: string; count: number; difficulty: Difficulty; titleHint?: string },
): Promise<GeneratedQuiz> {
  const user = [
    `Write ${input.count + 2} questions (a couple extra in case some are unusable).`,
    `Difficulty: ${input.difficulty}. ${DIFFICULTY_GUIDE[input.difficulty]}`,
    input.titleHint ? `The student calls these notes: "${input.titleHint}".` : '',
    '',
    '<notes>',
    input.notes,
    '</notes>',
  ].join('\n')
  const text = await claude(tools, quizSystemPrompt(), user, 6000)
  const quiz = validateQuiz(extractJsonObject(text), input.count)
  return { ...quiz, questions: quiz.questions.map((q) => shuffleOptions(q)) }
}

export function kitSystemPrompt(): string {
  return [
    'You turn a student’s own notes into a study kit. Use ONLY what is in the notes; never add outside facts.',
    'Write for a student cramming tonight: plain words, short sentences, concrete.',
    'Respond with ONLY a JSON object, no prose, in this exact shape:',
    '{',
    ' "summary": string — 2 to 4 short paragraphs separated by blank lines, the big picture first,',
    ' "concepts": [{"id": string (short kebab-case), "term": string, "explanation": string (2–3 sentences, plain language),',
    '               "example": string (one concrete example or analogy from or consistent with the notes, may be "")}]',
    '             — the 6 to 12 most important concepts, in the order a student should learn them,',
    ' "cheatSheet": [{"heading": string, "items": [string]}] — 3 to 6 sections, 3 to 8 items each; dense one-liners:',
    '             definitions, formulas, numbers, sequences, and "don’t confuse X with Y" pairs,',
    ' "conceptMap": {"nodes": [{"id": string, "label": string (≤ 4 words)}], "edges": [{"from": id, "to": id, "label": string (≤ 4 words)}]}',
    '             — 5 to 12 nodes (reuse concept ids where they match) and the relationships between them,',
    ' "questionConcepts": [string] — for each quiz question below, in order, the id of the ONE concept it tests ("" if none fits)',
    '}',
  ].join('\n')
}

export async function generateKit(
  tools: ActionTools,
  input: { notes: string; title: string; questions: Array<{ prompt: string }> },
): Promise<StudyKit> {
  const user = [
    `Topic: ${input.title}`,
    '',
    'Quiz questions (map each to a concept id):',
    ...input.questions.map((q, i) => `${i + 1}. ${q.prompt}`),
    '',
    '<notes>',
    input.notes,
    '</notes>',
  ].join('\n')
  const text = await claude(tools, kitSystemPrompt(), user, 8000)
  return validateKit(extractJsonObject(text), input.questions.length)
}

export interface MissedQuestion {
  concept?: string
  prompt: string
  yourAnswer: string | null
  correctAnswer: string
  explanation: string
}

export async function generateRecap(
  tools: ActionTools,
  input: {
    title: string
    summary: string
    name: string
    total: number
    correct: number
    rank: number
    players: number
    missed: MissedQuestion[]
  },
): Promise<string> {
  const system = [
    'You are a warm, direct study coach writing a short personal recap after a quiz game.',
    'Write plain text (no markdown headings, no tables). Use short paragraphs and "- " bullets.',
    'Structure: one sentence on how they did; then "What to review" with one bullet per weak concept',
    '(group related misses into one concept — use the [Concept: …] names when given — explain the correct idea in 1–2 sentences, plainly);',
    'then "Try this next" with 2 quick self-test prompts on those concepts (no answers).',
    'If they missed nothing, praise briefly and give 2 stretch prompts that go beyond the quiz.',
    'Stay under 220 words. Do not invent facts beyond the questions and explanations given.',
  ].join('\n')
  const missedText = input.missed.length
    ? input.missed
        .map(
          (m, i) =>
            `${i + 1}. ${m.concept ? `[Concept: ${m.concept}] ` : ''}Q: ${m.prompt}\n   Their answer: ${m.yourAnswer ?? '(no answer — ran out of time)'}\n   Correct: ${m.correctAnswer}\n   Why: ${m.explanation}`,
        )
        .join('\n')
    : '(none)'
  const user = [
    `Quiz: ${input.title}${input.summary ? ` — ${input.summary}` : ''}`,
    `Player: ${input.name}. Score: ${input.correct}/${input.total} correct, finished #${input.rank} of ${input.players}.`,
    'Questions they missed:',
    missedText,
  ].join('\n')
  return (await claude(tools, system, user, 900)).trim()
}

interface ElevenLabsResponse {
  audioUrl?: string
  audio_base64?: string
  audio?: string
  base64?: string
  data?: string
}

function stripDataUrl(raw: string): string {
  return raw.startsWith('data:') ? (raw.split(',', 2)[1] ?? '') : raw
}

/** Narrate one question (prompt + the four options). Returns base64 MP3. */
export async function narrateQuestion(
  tools: ActionTools,
  prompt: string,
  options: string[],
): Promise<string> {
  const letters = ['A', 'B', 'C', 'D']
  const text = `${prompt} ... ${options.map((o, i) => `${letters[i]}: ${o}.`).join(' ')}`
  const result = await tools.integration<ElevenLabsResponse>('elevenlabs/generate-speech', {
    text,
    voice_id: TTS_VOICE_ID,
    model_id: TTS_MODEL,
    output_format: TTS_OUTPUT_FORMAT,
  })
  if (!result.success) throw new Error(`tts_failed: ${result.error ?? 'unknown'}`)
  const r = unwrap<ElevenLabsResponse>(result.data)
  const raw = r?.audio_base64 ?? r?.audio ?? r?.base64 ?? r?.data ?? r?.audioUrl ?? ''
  const b64 = stripDataUrl(raw)
  if (!b64) throw new Error('tts_failed: no audio')
  return b64
}

interface GeminiImageResponse {
  base64Images?: string[]
  images?: Array<{ base64?: string; data?: string }>
}

/** Abstract cover art for a deck. Returns base64 PNG. */
export async function generateCover(tools: ActionTools, title: string, summary: string): Promise<string> {
  const prompt = [
    `Bold, playful abstract poster art representing the study topic "${title}".`,
    summary ? `Topic context: ${summary}` : '',
    'Flat geometric shapes, confident color blocking, subtle paper grain, energetic game-show mood.',
    'Absolutely no text, letters, numbers, logos, or human faces.',
  ].join(' ')
  const result = await tools.integration<GeminiImageResponse>('gemini/generate-image', {
    model: IMAGE_MODEL,
    prompt,
    aspectRatio: '16:9',
  })
  if (!result.success) throw new Error(`image_failed: ${result.error ?? 'unknown'}`)
  const r = unwrap<GeminiImageResponse>(result.data)
  const raw = r?.base64Images?.[0] ?? r?.images?.[0]?.base64 ?? r?.images?.[0]?.data ?? ''
  const b64 = stripDataUrl(raw)
  if (!b64) throw new Error('image_failed: no image')
  return b64
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
