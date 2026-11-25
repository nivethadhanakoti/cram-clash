import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useAuthProfileReady, useQuery } from 'deepspace'
import { ArrowRight, BookOpen, FileText, Loader2, Plus, Radio, Sparkles, Users } from 'lucide-react'
import { useToast } from '@/components/ui'
import { callAction } from '@/lib/callAction'
import { CODE_LENGTH, normalizeCode } from '@/lib/game-logic'
import { DeckCover, StatusChip } from '@/components/game/DeckCover'
import { OptionShape } from '@/components/game/GameUI'

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
    <div className="min-h-full bg-grain pb-16">
      <div className="mx-auto max-w-7xl space-y-14 px-3 py-5 sm:px-6 sm:py-8">
        {/* ── Hero: join a game / host a game ─────────────────────────── */}
        <section className="relative overflow-hidden rounded-[2rem] bg-[#1c1828] p-6 text-white shadow-[0_40px_80px_-40px_rgba(28,24,40,0.7)] sm:p-10 lg:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#ffc23d]/25 blur-3xl" />
            <div className="absolute right-1/4 top-1/2 h-96 w-96 rounded-full bg-[#8c7bff]/25 blur-3xl" />
            <div className="absolute -bottom-32 -right-10 h-80 w-80 rounded-full bg-[#22c3b0]/20 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1.3px)] [background-size:22px_22px]" />
          </div>

          <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.35fr_1fr]">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/85">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ffc23d]" /> Game night
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
                {firstName ? `Ready, ${firstName}?` : 'Ready to play?'}
              </h1>
              <p className="mt-3 text-lg text-white/70">Enter the code on the host’s screen to jump in.</p>
              <form
                onSubmit={join}
                data-testid="join-form"
                className="mt-7 flex max-w-xl items-center gap-2 rounded-full bg-white p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/5 focus-within:ring-4 focus-within:ring-[#ffc23d]/60"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(normalizeCode(e.target.value))}
                  placeholder="ABC123"
                  aria-label="Game code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="h-12 w-full min-w-0 flex-1 bg-transparent pl-4 font-mono text-xl font-bold uppercase tracking-[0.3em] text-[#1c1828] outline-none placeholder:text-[#1c1828]/25 sm:text-2xl"
                />
                <button
                  type="submit"
                  disabled={code.length !== CODE_LENGTH || joining}
                  className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-[#ff6b57] px-5 font-bold text-white transition hover:brightness-105 disabled:opacity-50 sm:px-7"
                >
                  {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Join <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            </div>

            <Link
              to="/decks/new"
              className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ffd166] to-[#ffb020] p-6 text-[#241a02] shadow-[0_30px_60px_-30px_rgba(255,176,32,0.6)] ring-1 ring-white/30 transition hover:-translate-y-1 sm:p-7"
            >
              <OptionShape index={0} className="absolute -right-6 -top-6 h-32 w-32 rotate-12 text-white/30 transition duration-500 group-hover:rotate-0" />
              <OptionShape index={3} className="absolute -bottom-5 right-16 h-16 w-16 -rotate-6 text-[#241a02]/10" />
              <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[#241a02] text-[#ffc93c]">
                <Plus className="h-5 w-5" />
              </span>
              <span className="relative mt-5 block font-display text-2xl font-extrabold">Host a game</span>
              <span className="relative mt-1 block max-w-xs text-[#241a02]/75">
                Turn your notes into a quiz and a study kit in about a minute, then share the code.
              </span>
              <span className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-[#241a02] px-5 py-2.5 text-sm font-bold text-[#ffc93c]">
                New quiz from notes <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </section>

        {liveGames.length > 0 && (
          <section>
            <SectionHeading title="Games in progress" caption="Live now — jump back in" />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveGames.map((g) => (
                <li key={g.recordId}>
                  <Link
                    to={`/play/${g.data.code}`}
                    className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="min-w-0">
                      <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#ff6b57]/12 px-2.5 py-0.5 text-xs font-bold text-[#c2412f]">
                        <Radio className="h-3 w-3" /> {g.data.status === 'lobby' ? 'In lobby' : 'Live'}
                      </span>
                      <p className="truncate text-lg font-bold">{g.data.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {g.data.hostId === userId ? 'You’re hosting' : `Hosted by ${g.data.hostName}`}
                      </p>
                    </div>
                    <span className="rounded-xl bg-secondary px-3 py-2 font-mono text-sm font-bold tracking-widest">{g.data.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionHeading title="Your quizzes" caption="Only you can see these" />
          {decks.status === 'loading' ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-72 animate-pulse rounded-3xl bg-card" />
              ))}
            </div>
          ) : decks.records.length === 0 ? (
            <Link
              to="/decks/new"
              className="flex flex-col items-center rounded-3xl border-2 border-dashed border-border bg-card/70 px-6 py-14 text-center transition hover:border-primary"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
                <FileText className="h-6 w-6 text-primary" />
              </span>
              <span className="mt-4 text-lg font-bold">No quizzes yet</span>
              <span className="mt-1 max-w-sm text-muted-foreground">Upload a lecture PDF or paste some notes to make your first one.</span>
              <span className="mt-4 font-semibold text-primary">Create a quiz →</span>
            </Link>
          ) : (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="deck-list">
              {decks.records.map((d) => (
                <li key={d.recordId}>
                  <Link
                    to={`/decks/${d.recordId}`}
                    className="group block overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="overflow-hidden">
                      <DeckCover
                        url={d.data.coverUrl}
                        title={d.data.title || d.data.sourceName}
                        className="transition duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="space-y-2 p-5">
                      <StatusChip status={d.data.status} />
                      <p className="line-clamp-2 min-w-0 break-words font-display text-xl font-extrabold leading-snug">
                        {d.data.title || d.data.sourceName || 'Untitled'}
                      </p>
                      {(d.data.status === 'generating' || d.data.status === 'queued') && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round((d.data.progress || 0.03) * 100)}%` }} />
                        </div>
                      )}
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" /> {d.data.questionCount} questions · <span className="capitalize">{d.data.difficulty}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading title="How CramClash works" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map((h) => (
              <li key={h.title} className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${h.tint}`}>
                  <h.icon className="h-5 w-5" />
                </span>
                <p className="mt-5 text-lg font-bold">{h.title}</p>
                <p className="mt-2 leading-relaxed text-muted-foreground">{h.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

const HOW = [
  {
    icon: FileText,
    tint: 'bg-[#8c7bff]/15 text-[#5b47d6]',
    title: 'Grounded in your notes',
    body: 'Claude writes every question from what you upload — nothing from outside your material.',
  },
  {
    icon: Users,
    tint: 'bg-[#ff6b57]/15 text-[#c2412f]',
    title: 'Live, fair multiplayer',
    body: 'Answers lock in on the server. Nobody sees the key or each other’s picks before the reveal.',
  },
  {
    icon: BookOpen,
    tint: 'bg-[#22c3b0]/15 text-[#0f8576]',
    title: 'A study kit for everyone',
    body: 'Summary, key concepts, a printable cheat sheet and a concept map — unlocked when the game ends.',
  },
  {
    icon: Sparkles,
    tint: 'bg-[#ffb020]/20 text-[#9a5f00]',
    title: 'A recap just for you',
    body: 'Each miss links to the concept to review, plus a private AI recap with self-test prompts.',
  },
]

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {caption && <p className="text-muted-foreground">{caption}</p>}
    </div>
  )
}
