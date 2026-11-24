import { describe, expect, it } from 'vitest'
import { buildMermaid, slugify, validateKit } from './kit-logic'

const good = {
  summary: 'Cells make ATP.\n\n\n\nMostly in mitochondria.',
  concepts: [
    { id: 'c1', term: 'Glycolysis', explanation: 'Splits glucose.', example: 'Sprinting muscles.' },
    { id: 'c2', term: 'Krebs cycle', explanation: 'Makes NADH.', example: '' },
    { id: 'c3', term: 'Glycolysis', explanation: 'Duplicate term.', example: '' },
    { id: 'bad', term: '', explanation: 'No term' },
  ],
  cheatSheet: [
    { heading: 'Yields', items: ['Glycolysis: 2 ATP', '', 'ETC: ~26 ATP'] },
    { heading: 'Empty', items: [] },
  ],
  conceptMap: {
    nodes: [
      { id: 'c1', label: 'Glycolysis' },
      { id: 'c2', label: 'Krebs cycle' },
      { id: 'x', label: 'Oxygen "O2"' },
    ],
    edges: [
      { from: 'c1', to: 'c2', label: 'pyruvate feeds' },
      { from: 'c2', to: 'c2', label: 'self loop' },
      { from: 'c1', to: 'missing', label: 'dangling' },
      { from: 'Oxygen "O2"', to: 'c2', label: '' },
      { from: 'c1', to: 'c2', label: 'duplicate' },
    ],
  },
  questionConcepts: ['c1', 'Krebs cycle', 'nonsense'],
}

describe('validateKit', () => {
  it('normalizes ids and keeps only valid entries', () => {
    const kit = validateKit(good, 4)
    expect(kit.summary).toBe('Cells make ATP.\n\nMostly in mitochondria.')
    expect(kit.concepts.map((c) => c.id)).toEqual(['glycolysis', 'krebs-cycle', 'glycolysis-2'])
    expect(kit.cheatSheet).toEqual([{ heading: 'Yields', items: ['Glycolysis: 2 ATP', 'ETC: ~26 ATP'] }])
  })

  it('maps questions to concepts by id or term, blank when unknown', () => {
    const kit = validateKit(good, 4)
    expect(kit.questionConcepts).toEqual(['glycolysis', 'krebs-cycle', '', ''])
  })

  it('keeps only edges between known nodes, without loops or duplicates', () => {
    const kit = validateKit(good, 3)
    expect(kit.conceptMap.nodes.map((n) => n.id)).toEqual(['glycolysis', 'krebs-cycle', 'oxygen-o2'])
    expect(kit.conceptMap.edges).toEqual([
      { from: 'glycolysis', to: 'krebs-cycle', label: 'pyruvate feeds' },
      { from: 'oxygen-o2', to: 'krebs-cycle', label: '' },
    ])
  })

  it('drops a map that has no connections', () => {
    const kit = validateKit({ ...good, conceptMap: { nodes: [{ id: 'a', label: 'A' }], edges: [] } }, 1)
    expect(kit.conceptMap).toEqual({ nodes: [], edges: [] })
  })

  it('tolerates missing parts but rejects an empty kit', () => {
    expect(validateKit({ summary: 'Only a summary' }, 2).concepts).toEqual([])
    expect(() => validateKit({ concepts: [], cheatSheet: [] }, 2)).toThrow(/empty kit/)
    expect(() => validateKit('nope', 2)).toThrow(/kit_parse_failed/)
  })
})

describe('buildMermaid', () => {
  it('re-keys ids and escapes labels so model text stays inside quotes', () => {
    const src = buildMermaid({
      nodes: [
        { id: 'a"]; click a call evil()', label: 'He said "hi" <b>' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a"]; click a call evil()', to: 'b', label: 'leads\nto' }],
    })
    expect(src).toBe(
      'flowchart TD\n  n0["He said #quot;hi#quot; b"]\n  n1["B"]\n  n0 -->|"leads to"| n1',
    )
    expect(src).not.toContain('evil')
  })

  it('returns nothing for an empty map', () => {
    expect(buildMermaid({ nodes: [], edges: [] })).toBe('')
  })
})

describe('slugify', () => {
  it('makes URL-safe ids', () => {
    expect(slugify('Électron Transport Chain (ETC)!')).toBe('electron-transport-chain-etc')
    expect(slugify('***')).toBe('concept')
  })
})
