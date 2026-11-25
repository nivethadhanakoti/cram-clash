import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useAuthProfileReady, useQuery } from 'deepspace'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/callAction'
import { CODE_LENGTH, normalizeCode } from '@/lib/game-logic'
import { DeckCover, StatusChip } from '@/components/game/DeckCover'
import { Panel } from '@/components/game/GameUI'

interface Deck {
  title: string
  status: string
  progress: number
  questionCount: number
  difficulty: string
  coverUrl: string
  sourceName: string
}
interface Game {
  code: string
  title: string
  status: string
  hostId: string
  hostName: string
}
interface Player {
  gameId: string
  userId: string
}

export default function HomePage() {
  const { userId } = useAuth()
  const { user } = useAuthProfileReady({ requireUser: true })
  const navigate = useNavigate()
  const { error } = useToast()
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)

  const decks = useQuery<Deck>('decks', { orderBy: 'createdAt', orderDir: 'desc', limit: 50 })
  const myPlayerRows = useQuery<Player>('players', { where: { userId: userId ?? '' }, limit: 50 })
  const games = useQuery<Game>('games', { orderBy: 'createdAt', orderDir: 'desc', limit: 200 })

  const liveGames = useMemo(() => {
    const joined = new Set(myPlayerRows.records.map((p) => p.data.gameId))
    return games.records.filter(
      (g) => g.data.status !== 'finished' && (g.data.hostId === userId || joined.has(g.recordId)),
    )
  }, [games.records, myPlayerRows.records, userId])

  async function join(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeCode(code)
    if (normalized.length !== CODE_LENGTH) return
    setJoining(true)
    const res = await callAction<{ gameId: string }>('joinGame', { code: normalized })
    setJoining(false)
    if (!res.success) return error('Couldn’t join', res.error)
    navigate(`/play/${normalized}`)
  }

  const firstName = (user?.name ?? '').split(' ')[0]

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-6xl space-y-10 px-5 py-8 sm:py-12">
        <section className="grid gap-5 grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
          <Panel className="flex flex-col justify-center border-2 border-primary">
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {firstName ? `Ready, ${firstName}?` : 'Ready to play?'}
            </h1>
            <p className="mt-2 text-muted-foreground">Enter the code on the host’s screen.</p>
            <form onSubmit={join} className="mt-5 flex flex-col gap-3 sm:flex-row" data-testid="join-form">
              <input
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="ABC123"
                aria-label="Game code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-14 w-full min-w-0 flex-1 rounded-2xl border border-input bg-background px-4 text-center font-mono text-xl font-bold uppercase tracking-[0.25em] sm:text-2xl sm:tracking-[0.35em] outline-none placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" size="lg" className="h-14 rounded-2xl px-8 text-base" disabled={code.length !== CODE_LENGTH || joining}>
                {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Join <ArrowRight className="ml-1 h-5 w-5" /></>}
              </Button>
            </form>
          </Panel>

          <Panel className="flex flex-col justify-between gap-4 bg-primary text-primary-foreground">
            <div>
              <h2 className="font-display text-2xl font-extrabold">Host a game</h2>
              <p className="mt-1 opacity-80">Turn your notes into a quiz in about a minute, then share the code.</p>
            </div>
            <Link
              to="/decks/new"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-[#241a02] px-5 py-2.5 font-semibold text-[#ffc93c] transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New quiz from notes
            </Link>
          </Panel>
        </section>

        {liveGames.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-xl font-bold">Games in progress</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {liveGames.map((g) => (
                <li key={g.recordId}>
                  <Link
                    to={`/play/${g.data.code}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:bg-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.data.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {g.data.hostId === userId ? 'You’re hosting' : `Hosted by ${g.data.hostName}`} ·{' '}
                        {g.data.status === 'lobby' ? 'in lobby' : 'live'}
                      </p>
                    </div>
                    <span className="font-mono font-bold tracking-widest text-primary">{g.data.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-xl font-bold">Your quizzes</h2>
          </div>
          {decks.status === 'loading' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-3xl bg-card" />
              ))}
            </div>
          ) : decks.records.length === 0 ? (
            <Panel className="py-10 text-center">
              <p className="font-semibold">No quizzes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Upload a lecture PDF or paste some notes to make your first one.</p>
              <Link to="/decks/new" className="mt-4 inline-block font-semibold text-primary hover:underline">
                Create a quiz →
              </Link>
            </Panel>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="deck-list">
              {decks.records.map((d) => (
                <li key={d.recordId}>
                  <Link
                    to={`/decks/${d.recordId}`}
                    className="group block overflow-hidden rounded-3xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <DeckCover url={d.data.coverUrl} title={d.data.title || d.data.sourceName} />
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 min-w-0 break-words font-semibold leading-snug">
                          {d.data.title || d.data.sourceName || 'Untitled'}
                        </p>
                        <StatusChip status={d.data.status} />
                      </div>
                      {(d.data.status === 'generating' || d.data.status === 'queued') && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round((d.data.progress || 0.03) * 100)}%` }} />
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {d.data.questionCount} questions · <span className="capitalize">{d.data.difficulty}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
