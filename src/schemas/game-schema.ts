import type { CollectionSchema } from 'deepspace/schema'

/**
 * Live game state. Every signed-in member can read games (that is how a join
 * code resolves), but nobody writes them from the client: the host's actions
 * are the only writers, so scores and timing are server-authoritative.
 */
export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain', required: true },
    { name: 'deckId', storage: 'text', interpretation: 'plain' },
    { name: 'hostId', storage: 'text', interpretation: 'plain' },
    { name: 'hostName', storage: 'text', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'coverUrl', storage: 'text', interpretation: 'plain' },
    /** lobby → question ⇄ reveal → finished */
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'currentIndex', storage: 'number', interpretation: 'plain' },
    { name: 'totalQuestions', storage: 'number', interpretation: 'plain' },
    { name: 'secondsPerQuestion', storage: 'number', interpretation: 'plain' },
    /** Server epoch ms. Clients render the countdown from these. */
    { name: 'questionStartedAt', storage: 'number', interpretation: 'plain' },
    { name: 'questionEndsAt', storage: 'number', interpretation: 'plain' },
    /** The live question WITHOUT its answer. */
    { name: 'currentPrompt', storage: 'text', interpretation: 'plain' },
    { name: 'currentOptions', storage: 'text', interpretation: 'plain' },
    { name: 'currentAudioUrl', storage: 'text', interpretation: 'plain' },
    /** -1 until the host reveals the current question. */
    { name: 'revealedIndex', storage: 'number', interpretation: 'plain' },
    { name: 'revealedExplanation', storage: 'text', interpretation: 'plain' },
    /** JSON tally of picks per option, published at reveal. */
    { name: 'revealedCounts', storage: 'text', interpretation: 'plain' },
    /** JSON answer key for the whole quiz, published only when finished. */
    { name: 'reviewJson', storage: 'text', interpretation: 'plain' },
    { name: 'finishedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}

/** Scoreboard rows. Readable by everyone in the app; written only by actions. */
export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'streak', storage: 'number', interpretation: 'plain' },
    { name: 'correctCount', storage: 'number', interpretation: 'plain' },
    /** Index of the last question answered — lets the host see who is done
     *  without exposing anyone's choice. */
    { name: 'lastAnsweredIndex', storage: 'number', interpretation: 'plain' },
    /** Points earned on the last revealed question (set at reveal). */
    { name: 'lastPoints', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['gameId', 'userId'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}

/**
 * One row per player per question. Players read only their own answers, so
 * nobody can copy a choice before the reveal. Written only by submitAnswer;
 * revealAnswer reads them to score the players' rows.
 */
export const answersSchema: CollectionSchema = {
  name: 'answers',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'questionIndex', storage: 'number', interpretation: 'plain' },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'choice', storage: 'number', interpretation: 'plain' },
    /** Server-measured time from question open to answer. */
    { name: 'msTaken', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['gameId', 'questionIndex', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}

/** A player's AI study recap for one game. Private to that player. */
export const recapsSchema: CollectionSchema = {
  name: 'recaps',
  columns: [
    { name: 'gameId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'text', storage: 'text', interpretation: 'plain', maxLength: 8000 },
  ],
  uniqueOn: ['gameId', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
