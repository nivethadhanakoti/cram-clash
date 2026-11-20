/**
 * Scheduled tasks — registered into AppCronRoom (worker.ts).
 *
 *   - 'cleanup-games' (hourly): deletes games, their players, answers and
 *     recaps once they are stale — finished more than 24h ago, or abandoned
 *     mid-play/in the lobby for more than 12h. Keeps the shared room small
 *     and frees join codes for reuse.
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { createActionTools } from './server/action-routes'

export const tasks: CronTask[] = [{ name: 'cleanup-games', intervalMinutes: 60 }]

const FINISHED_TTL_MS = 24 * 60 * 60 * 1000
const ABANDONED_TTL_MS = 12 * 60 * 60 * 1000

interface GameRow extends Record<string, unknown> {
  status?: string
  finishedAt?: number
}

async function drain(
  tools: ReturnType<typeof createActionTools>,
  collection: string,
  where: Record<string, unknown>,
) {
  for (let i = 0; i < 50; i++) {
    const res = await tools.deleteWhere(collection, where, 500)
    if (!res.success || res.data.deleted < 500) return
  }
}

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== 'cleanup-games') return
  const tools = createActionTools(env, env.OWNER_USER_ID, env.APP_OWNER_JWT)
  const now = Date.now()
  const res = await tools.query<GameRow>('games', { limit: 500 })
  if (!res.success) {
    console.error('[cleanup-games] query failed', res.error)
    return
  }
  let removed = 0
  for (const game of res.data.records) {
    const updatedAt = Date.parse(game.updatedAt)
    const stale =
      game.data.status === 'finished'
        ? now - (Number(game.data.finishedAt) || updatedAt) > FINISHED_TTL_MS
        : now - updatedAt > ABANDONED_TTL_MS
    if (!stale) continue
    const gameId = game.recordId
    await drain(tools, 'answers', { gameId })
    await drain(tools, 'players', { gameId })
    await drain(tools, 'recaps', { gameId })
    await tools.remove('games', gameId)
    removed++
  }
  if (removed) console.info(`[cleanup-games] removed ${removed} stale game(s)`)
}
