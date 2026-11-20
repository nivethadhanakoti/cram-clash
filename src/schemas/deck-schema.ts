import type { CollectionSchema } from 'deepspace/schema'

/**
 * A deck is a quiz generated from one set of study notes.
 *
 * Only the owner can read their decks. Every write that matters (creation,
 * generation status, cover art) happens server-side in actions and the
 * generate-deck job; the owner may only rename.
 */
export const decksSchema: CollectionSchema = {
  name: 'decks',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'sourceName', storage: 'text', interpretation: 'plain', maxLength: 200 },
    /** Key of the original uploaded file in the owner's private storage. */
    { name: 'sourceKey', storage: 'text', interpretation: 'plain' },
    /** Extracted plain text the quiz is generated from. */
    { name: 'sourceText', storage: 'text', interpretation: 'plain', maxLength: 60000 },
    { name: 'questionCount', storage: 'number', interpretation: 'plain' },
    { name: 'difficulty', storage: 'text', interpretation: { kind: 'select', options: ['easy', 'medium', 'hard'] } },
    { name: 'narrate', storage: 'number', interpretation: 'plain' },
    /** queued → generating → ready | failed */
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'progress', storage: 'number', interpretation: 'plain' },
    { name: 'statusMessage', storage: 'text', interpretation: 'plain' },
    { name: 'summary', storage: 'text', interpretation: 'plain' },
    { name: 'coverUrl', storage: 'text', interpretation: 'plain' },
    { name: 'audioFailures', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false, writableFields: ['title'] },
    admin: { read: true, create: false, update: true, delete: true },
  },
}

/**
 * Questions hold the answer key, so they are readable by the deck owner only.
 * Players never read this collection: the live question is copied onto the
 * game record without its answer, and the answer is published at reveal.
 */
export const questionsSchema: CollectionSchema = {
  name: 'questions',
  columns: [
    { name: 'deckId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'idx', storage: 'number', interpretation: 'plain' },
    { name: 'prompt', storage: 'text', interpretation: 'plain', maxLength: 600 },
    /** JSON array of exactly four option strings. */
    { name: 'options', storage: 'text', interpretation: 'plain' },
    { name: 'correctIndex', storage: 'number', interpretation: 'plain' },
    { name: 'explanation', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    { name: 'audioUrl', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['deckId', 'idx'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
