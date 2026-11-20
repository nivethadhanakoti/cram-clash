import { describe, expect, it } from 'vitest'
import {
  clampQuestionCount,
  extractJsonObject,
  generateCode,
  isValidCode,
  normalizeCode,
  rankPlayers,
  scoreAnswer,
  shuffleOptions,
  tallyChoices,
  validateQuiz,
} from './game-logic'

function seq(values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

const goodQuestion = (n: number) => ({
  prompt: `Question ${n}?`,
  options: [`A${n}`, `B${n}`, `C${n}`, `D${n}`],
  correctIndex: n % 4,
  explanation: `Because ${n}.`,
})

describe('join codes', () => {
  it('generates valid 6-char codes without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode()
      expect(isValidCode(code)).toBe(true)
      expect(code).not.toMatch(/[IO01]/)
    }
  })

  it('normalizes user input', () => {
    expect(normalizeCode(' ab-c d2f9 ')).toBe('ABCD2F')
    expect(isValidCode('ABC')).toBe(false)
    expect(isValidCode('ABCDE0')).toBe(false)
  })
})

describe('scoreAnswer', () => {
  it('gives nothing for wrong answers', () => {
    expect(scoreAnswer({ correct: false, msTaken: 0, limitMs: 20000, streakBefore: 5 })).toBe(0)
  })

  it('rewards speed between 500 and 1000', () => {
    expect(scoreAnswer({ correct: true, msTaken: 0, limitMs: 20000, streakBefore: 0 })).toBe(1000)
    expect(scoreAnswer({ correct: true, msTaken: 10000, limitMs: 20000, streakBefore: 0 })).toBe(750)
    expect(scoreAnswer({ correct: true, msTaken: 99999, limitMs: 20000, streakBefore: 0 })).toBe(500)
  })

  it('caps the streak bonus at 300', () => {
    expect(scoreAnswer({ correct: true, msTaken: 20000, limitMs: 20000, streakBefore: 1 })).toBe(600)
    expect(scoreAnswer({ correct: true, msTaken: 20000, limitMs: 20000, streakBefore: 10 })).toBe(800)
  })

  it('treats negative time (clock skew) as instant', () => {
    expect(scoreAnswer({ correct: true, msTaken: -50, limitMs: 20000, streakBefore: 0 })).toBe(1000)
  })
})

describe('quiz parsing', () => {
  it('extracts JSON wrapped in prose and fences', () => {
    const text = 'Here you go:\n```json\n{"title":"T","questions":[]}\n```\nEnjoy'
    expect(extractJsonObject(text)).toEqual({ title: 'T', questions: [] })
  })

  it('throws when there is no JSON', () => {
    expect(() => extractJsonObject('nope')).toThrow(/quiz_parse_failed/)
  })

  it('keeps valid questions and drops malformed ones', () => {
    const raw = {
      title: '  Cells   101 ',
      summary: 'About cells',
      questions: [
        goodQuestion(1),
        { ...goodQuestion(2), options: ['a', 'b', 'c'] }, // 3 options
        { ...goodQuestion(3), correctIndex: 7 }, // out of range
        { ...goodQuestion(4), options: ['x', 'X', 'y', 'z'] }, // duplicate options
        goodQuestion(5),
        { ...goodQuestion(5) }, // duplicate prompt
        goodQuestion(6),
      ],
    }
    const quiz = validateQuiz(raw, 5)
    expect(quiz.title).toBe('Cells 101')
    expect(quiz.questions.map((q) => q.prompt)).toEqual(['Question 1?', 'Question 5?', 'Question 6?'])
  })

  it('fails when too few questions survive', () => {
    expect(() => validateQuiz({ questions: [goodQuestion(1)] }, 10)).toThrow(/only 1 valid/)
  })

  it('stops at the requested count', () => {
    const quiz = validateQuiz({ questions: [1, 2, 3, 4, 5, 6, 7].map(goodQuestion) }, 5)
    expect(quiz.questions).toHaveLength(5)
  })
})

describe('shuffleOptions', () => {
  it('keeps the correct answer attached to the same text', () => {
    for (let t = 0; t < 50; t++) {
      const q = goodQuestion(t)
      const s = shuffleOptions(q)
      expect(s.options[s.correctIndex]).toBe(q.options[q.correctIndex])
      expect([...s.options].sort()).toEqual([...q.options].sort())
    }
  })

  it('is deterministic for a given random source', () => {
    const q = goodQuestion(0)
    expect(shuffleOptions(q, seq([0.9, 0.1, 0.5]))).toEqual(shuffleOptions(q, seq([0.9, 0.1, 0.5])))
  })
})

describe('rankPlayers', () => {
  it('sorts by score and shares ranks on ties', () => {
    const ranked = rankPlayers([
      { userId: 'a', name: 'Ann', score: 500, correctCount: 1 },
      { userId: 'b', name: 'Bob', score: 1500, correctCount: 2 },
      { userId: 'c', name: 'Cat', score: 500, correctCount: 1 },
      { userId: 'd', name: 'Dan', score: 0, correctCount: 0 },
    ])
    expect(ranked.map((p) => [p.name, p.rank])).toEqual([
      ['Bob', 1],
      ['Ann', 2],
      ['Cat', 2],
      ['Dan', 4],
    ])
  })
})

describe('tallyChoices', () => {
  it('counts picks per option and ignores junk', () => {
    expect(tallyChoices([0, 1, 1, 3, 9, -1])).toEqual([1, 2, 0, 1])
  })
})

describe('clampQuestionCount', () => {
  it('clamps into 5..15', () => {
    expect(clampQuestionCount(2)).toBe(5)
    expect(clampQuestionCount(99)).toBe(15)
    expect(clampQuestionCount('abc')).toBe(10)
  })
})
