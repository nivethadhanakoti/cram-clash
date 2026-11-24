import { useEffect, useState } from 'react'
import { callAction } from '@/lib/callAction'
import type { KitContent } from './StudyKitView'

export type GameKit = KitContent & { title: string }

/**
 * Fetch a game's study kit through the `getStudyKit` action (players can't
 * read the kits collection directly). `enabled` lets callers wait until the
 * game has finished.
 */
export function useGameKit(gameId: string | undefined, enabled = true) {
  const [kit, setKit] = useState<GameKit | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!gameId || !enabled) return
    let alive = true
    setLoading(true)
    void callAction<GameKit>('getStudyKit', { gameId }).then((res) => {
      if (!alive) return
      setLoading(false)
      if (res.success) setKit(res.data)
      else setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [gameId, enabled])

  return { kit, error, loading }
}
