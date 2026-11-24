/**
 * A finished game's study kit, for its players (and host). Access is
 * checked server-side by the getStudyKit action.
 */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { normalizeCode } from '@/lib/game-logic'
import { StudyKitView } from '@/components/kit/StudyKitView'
import { useGameKit } from '@/components/kit/useGameKit'

export default function GameKitPage() {
  const { code: raw = '' } = useParams()
  const code = normalizeCode(raw)
  const games = useQuery<{ code: string; title: string }>('games', { where: { code }, limit: 1 })
  const game = games.records[0]
  const { kit, error } = useGameKit(game?.recordId)

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <Link to={`/play/${code}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Study kit</p>
          <h1 className="mt-1 break-words font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {kit?.title ?? game?.data.title ?? 'Study kit'}
          </h1>
        </header>
        {games.status !== 'loading' && !game ? (
          <p className="text-muted-foreground">No game with code {code}.</p>
        ) : error ? (
          <p className="rounded-2xl bg-card p-6 text-center text-muted-foreground" data-testid="kit-error">{error}</p>
        ) : kit ? (
          <StudyKitView kit={kit} title={kit.title} />
        ) : (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
      </div>
    </div>
  )
}
