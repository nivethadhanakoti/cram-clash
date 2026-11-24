import type { CollectionSchema } from 'deepspace/schema'

/**
 * One study kit per deck, generated from the same notes as the quiz.
 *
 * Readable only by the deck owner through RBAC. Players never read this
 * collection directly: once a game they played has finished, the
 * `getStudyKit` action checks they were in it and returns the kit. "Shared
 * through a finished game" can't be expressed as a row rule, so the action
 * is the gate — the same pattern the answer key uses.
 */
export const kitsSchema: CollectionSchema = {
  name: 'kits',
  columns: [
    { name: 'deckId', storage: 'text', interpretation: 'plain', required: true },
    /** generating → ready | failed */
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'statusMessage', storage: 'text', interpretation: 'plain' },
    { name: 'summary', storage: 'text', interpretation: 'plain', maxLength: 3000 },
    /** JSON KitConcept[] */
    { name: 'concepts', storage: 'text', interpretation: 'plain' },
    /** JSON CheatSection[] */
    { name: 'cheatSheet', storage: 'text', interpretation: 'plain' },
    /** JSON { nodes, edges } */
    { name: 'conceptMap', storage: 'text', interpretation: 'plain' },
    /** JSON string[] — concept id per question index */
    { name: 'questionConcepts', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['deckId'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
