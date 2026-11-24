/**
 * Study kit rules shared by the worker (validation) and the client
 * (rendering). No SDK imports, so this file is unit-tested directly.
 *
 * A kit is generated once per deck from the same notes as the quiz:
 *   - summary      a short overview in plain paragraphs
 *   - concepts     key terms, each with an explanation and an example
 *   - cheatSheet   dense one-pager, grouped into sections
 *   - conceptMap   nodes/edges showing how the concepts connect
 * plus questionConcepts: for each quiz question, the concept it tests,
 * so a missed question can link straight to what to review.
 */

export interface KitConcept {
  id: string
  term: string
  explanation: string
  example: string
}

export interface CheatSection {
  heading: string
  items: string[]
}

export interface MapNode {
  id: string
  label: string
}

export interface MapEdge {
  from: string
  to: string
  label: string
}

export interface StudyKit {
  summary: string
  concepts: KitConcept[]
  cheatSheet: CheatSection[]
  conceptMap: { nodes: MapNode[]; edges: MapEdge[] }
  /** conceptId per question index ('' when no good match). */
  questionConcepts: string[]
}

export const MAX_CONCEPTS = 14
export const MAX_MAP_NODES = 14
export const MAX_MAP_EDGES = 24
export const MAX_CHEAT_SECTIONS = 8
export const MAX_CHEAT_ITEMS = 10

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : ''
}

/** Stable, URL-safe id from a term ("Krebs cycle" → "krebs-cycle"). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'concept'
  )
}

/**
 * Validate and normalize model output. Each part is checked on its own and
 * bad entries are dropped, so one malformed section never loses the rest.
 * Throws only when nothing useful survives.
 */
export function validateKit(raw: unknown, questionCount: number): StudyKit {
  if (!raw || typeof raw !== 'object') throw new Error('kit_parse_failed: not an object')
  const obj = raw as Record<string, unknown>

  const summary = typeof obj.summary === 'string'
    ? obj.summary.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000)
    : ''

  // Concepts: unique ids, derived from the term when the model's id is bad.
  const concepts: KitConcept[] = []
  const ids = new Set<string>()
  const modelIdToId = new Map<string, string>()
  for (const item of Array.isArray(obj.concepts) ? obj.concepts : []) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const term = clean(c.term, 80)
    const explanation = clean(c.explanation, 700)
    if (!term || !explanation) continue
    let id = slugify(term)
    for (let n = 2; ids.has(id); n++) id = `${slugify(term)}-${n}`
    ids.add(id)
    const modelId = clean(c.id, 60)
    if (modelId) modelIdToId.set(modelId, id)
    modelIdToId.set(term.toLowerCase(), id)
    concepts.push({ id, term, explanation, example: clean(c.example, 400) })
    if (concepts.length >= MAX_CONCEPTS) break
  }
  const resolve = (ref: unknown): string => {
    const r = clean(ref, 80)
    if (!r) return ''
    if (ids.has(r)) return r
    return modelIdToId.get(r) ?? modelIdToId.get(r.toLowerCase()) ?? (ids.has(slugify(r)) ? slugify(r) : '')
  }

  const cheatSheet: CheatSection[] = []
  for (const item of Array.isArray(obj.cheatSheet) ? obj.cheatSheet : []) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const heading = clean(s.heading, 80)
    const items = (Array.isArray(s.items) ? s.items : [])
      .map((i) => clean(i, 240))
      .filter(Boolean)
      .slice(0, MAX_CHEAT_ITEMS)
    if (!heading || items.length === 0) continue
    cheatSheet.push({ heading, items })
    if (cheatSheet.length >= MAX_CHEAT_SECTIONS) break
  }

  // Concept map: nodes may reference concepts or stand alone; edges must
  // connect two known nodes and never loop to themselves.
  const nodes: MapNode[] = []
  const nodeIds = new Set<string>()
  const mapRaw = (obj.conceptMap && typeof obj.conceptMap === 'object' ? obj.conceptMap : {}) as Record<string, unknown>
  const nodeAlias = new Map<string, string>()
  for (const item of Array.isArray(mapRaw.nodes) ? mapRaw.nodes : []) {
    if (!item || typeof item !== 'object') continue
    const n = item as Record<string, unknown>
    const label = clean(n.label, 60)
    if (!label) continue
    let id = resolve(n.id) || slugify(label)
    if (nodeIds.has(id)) continue
    nodeIds.add(id)
    const rawId = clean(n.id, 60)
    if (rawId) nodeAlias.set(rawId, id)
    nodeAlias.set(label.toLowerCase(), id)
    nodes.push({ id, label })
    if (nodes.length >= MAX_MAP_NODES) break
  }
  const nodeRef = (ref: unknown) => {
    const r = clean(ref, 80)
    if (nodeIds.has(r)) return r
    return nodeAlias.get(r) ?? nodeAlias.get(r.toLowerCase()) ?? ''
  }
  const edges: MapEdge[] = []
  const seenEdges = new Set<string>()
  for (const item of Array.isArray(mapRaw.edges) ? mapRaw.edges : []) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const from = nodeRef(e.from)
    const to = nodeRef(e.to)
    if (!from || !to || from === to) continue
    const key = `${from}>${to}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    edges.push({ from, to, label: clean(e.label, 40) })
    if (edges.length >= MAX_MAP_EDGES) break
  }
  // A map with no connections isn't a map.
  const conceptMap = edges.length ? { nodes, edges } : { nodes: [], edges: [] }

  const qc = Array.isArray(obj.questionConcepts) ? obj.questionConcepts : []
  const questionConcepts = Array.from({ length: questionCount }, (_, i) => resolve(qc[i]))

  if (!summary && concepts.length === 0 && cheatSheet.length === 0) {
    throw new Error('kit_parse_failed: empty kit')
  }
  return { summary, concepts, cheatSheet, conceptMap, questionConcepts }
}

/** Escape a label for a quoted Mermaid string. */
function mermaidLabel(text: string): string {
  return text
    .replace(/"/g, '#quot;')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build Mermaid flowchart source. Node ids are re-keyed to n0, n1… so no
 *  model-supplied text ever lands outside a quoted label. */
export function buildMermaid(map: StudyKit['conceptMap'], direction: 'TD' | 'LR' = 'TD'): string {
  if (!map.nodes.length) return ''
  const key = new Map(map.nodes.map((n, i) => [n.id, `n${i}`]))
  const lines = [`flowchart ${direction}`]
  for (const n of map.nodes) lines.push(`  ${key.get(n.id)}["${mermaidLabel(n.label)}"]`)
  for (const e of map.edges) {
    const a = key.get(e.from)
    const b = key.get(e.to)
    if (!a || !b) continue
    const label = mermaidLabel(e.label)
    lines.push(label ? `  ${a} -->|"${label}"| ${b}` : `  ${a} --> ${b}`)
  }
  return lines.join('\n')
}

export function parseKitField<T>(v: unknown, fallback: T): T {
  if (v && typeof v === 'object') return v as T
  if (typeof v !== 'string' || !v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}
