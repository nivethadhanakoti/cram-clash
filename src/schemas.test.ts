import { describe, expect, it } from 'vitest'
import { lintSchemas } from 'deepspace/worker'
import { schemas } from './schemas'

describe('schemas', () => {
  it('pass the SDK schema linter', () => {
    expect(lintSchemas(schemas)).toEqual([])
  })

  // lintSchemas does not check these references (verified by feeding it a
  // schema with a bogus ownerField), so check them here.
  it('reference only real columns in ownerField and uniqueOn', () => {
    for (const s of schemas) {
      const cols = new Set(s.columns.map((c) => c.name))
      if (s.ownerField) expect(cols.has(s.ownerField), `${s.name}.ownerField`).toBe(true)
      for (const u of s.uniqueOn ?? []) expect(cols.has(u), `${s.name}.uniqueOn ${u}`).toBe(true)
    }
  })

  it('never let clients write game state or read the answer key', () => {
    const byName = Object.fromEntries(schemas.map((s) => [s.name, s]))
    for (const name of ['games', 'players', 'answers', 'questions', 'recaps']) {
      for (const role of ['member', 'viewer']) {
        const p = byName[name].permissions[role]
        expect(p.create, `${name}.${role}.create`).toBe(false)
        expect(p.update, `${name}.${role}.update`).toBe(false)
        expect(p.delete, `${name}.${role}.delete`).toBe(false)
      }
    }
    expect(byName.questions.permissions.member.read).toBe('own')
    expect(byName.answers.permissions.member.read).toBe('own')
  })
})
