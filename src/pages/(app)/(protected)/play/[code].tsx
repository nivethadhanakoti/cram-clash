/**
 * The live game. One URL (/play/CODE) for everyone: the host sees the
 * presenter screen, players see the answer pad. Both render purely from the
 * synced `games` / `players` / `answers` records; every state change goes
 * through a server action, so a refresh or a dropped connection just resumes.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, usePresenceRoom, useQuery } from 'deepspace'
import {
  ArrowRight,
  Check,
  Copy,
  Flag,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Users,
  BookOpen,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction, serverNow } from '@/lib/callAction'
import { normalizeCode, parseJsonArray, rankPlayers, type ReviewItem } from '@/lib/game-logic'
import {
  Countdown,
  Leaderboard,
  OptionShape,
  OptionTile,
  Panel,
  Podium,
  QrCode,
  playClip,
  useNarration,
  useTicker,
  type BoardPlayer,
  type OptionState,
} from '@/components/game/GameUI'
import { useGameKit } from '@/components/kit/useGameKit'
import { conceptAnchor } from '@/components/kit/StudyKitView'

interface Game {
  code: string
  deckId: string
  hostId: string
  hostName: string
  title: string
  coverUrl: string
  status: 'lobby' | 'question' | 'reveal' | 'finished'
  currentIndex: number
  totalQuestions: number
  secondsPerQuestion: number
  questionStartedAt: number
  questionEndsAt: number
  currentPrompt: string
  currentOptions: string
  currentAudioUrl: string
  revealedIndex: number
  revealedExplanation: string
  revealedCounts: string
  reviewJson: string
}
interface Player extends BoardPlayer {
  gameId: string
  streak: number
  lastAnsweredIndex: number
  lastPoints: number
}
interface Answer {
  gameId: string
  questionIndex: number
  userId: string
  choice: number
}

export default function PlayPage() {
  const { code: raw = '' } = useParams()
  const code = normalizeCode(raw)
  const games = useQuery<Game>('games', { where: { code }, limit: 1 })
  const game = games.records[0]

  if (games.status === 'loading') return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
  if (!game) {
    return (
      <Centered>
        <p className="font-display text-2xl font-bold">No game with code {code}</p>
        <p className="mt-2 text-muted-foreground">Check the code on the host’s screen.</p>
        <Link to="/home" className="mt-4 inline-block font-semibold text-primary hover:underline">Back home</Link>
      </Centered>
    )
  }
  return <GameRoom gameId={game.recordId} game={game.data} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">{children}</div>
}

function GameRoom({ gameId, game }: { gameId: string; game: Game }) {
  const { userId } = useAuth()
  const { error } = useToast()
  const playersQ = useQuery<Player>('players', { where: { gameId }, limit: 60 })
  const { peers, connected } = usePresenceRoom(`game:${gameId}`)
  const isHost = game.hostId === userId
  const players = playersQ.records.map((r) => r.data)
  const me = players.find((p) => p.userId === userId)

  const online = useMemo(() => {
    const ids = new Set(peers.map((p) => p.userId))
    return (id: string) => id === userId || ids.has(id)
  }, [peers, userId])

  // Opening /play/CODE directly (shared link or QR) joins you automatically.
  const joinTried = useRef(false)
  const [joinError, setJoinError] = useState('')
  useEffect(() => {
    if (isHost || me || playersQ.status !== 'ready' || joinTried.current || game.status === 'finished') return
    joinTried.current = true
    void callAction('joinGame', { code: game.code }).then((res) => {
      if (!res.success) {
        setJoinError(res.error)
        error('Couldn’t join', res.error)
      }
    })
  }, [isHost, me, playersQ.status, game.status, game.code, error])

  if (!isHost && !me) {
    return (
      <Centered>
        {joinError ? (
          <>
            <p className="font-display text-2xl font-bold">{joinError}</p>
            <Link to="/home" className="mt-4 inline-block font-semibold text-primary hover:underline">Back home</Link>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">Joining {game.title}…</p>
          </>
        )}
      </Centered>
    )
  }

  const hostOnline = isHost || online(game.hostId)

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{game.title}</h1>
          {game.status !== 'lobby' && game.status !== 'finished' && (
            <span className="font-mono text-sm text-muted-foreground">
              Q{game.currentIndex + 1}/{game.totalQuestions}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> {players.length}
          </span>
          <span
            className={cn('inline-flex items-center gap-1 text-xs', connected ? 'text-success' : 'text-warning')}
            title={connected ? 'Live' : 'Reconnecting…'}
          >
            {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
        </header>

        {!hostOnline && game.status !== 'finished' && (
          <p className="mb-4 rounded-xl bg-warning/10 px-4 py-2 text-sm text-warning">
            The host looks disconnected — the game resumes as soon as they’re back.
          </p>
        )}

        {isHost ? (
          <HostView gameId={gameId} game={game} players={players} online={online} />
        ) : (
          <PlayerView gameId={gameId} game={game} players={players} me={me!} online={online} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Host
// ═══════════════════════════════════════════════════════════════════════════

function HostView({
  gameId,
  game,
  players,
  online,
}: {
  gameId: string
  game: Game
  players: Player[]
  online: (id: string) => boolean
}) {
  const { error } = useToast()
  const [busy, setBusy] = useState('')
  const [muted, setMuted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const options = parseJsonArray<string>(game.currentOptions)
  const counts = parseJsonArray<number>(game.revealedCounts)
  const answered = players.filter((p) => p.lastAnsweredIndex === game.currentIndex).length
  const isQuestion = game.status === 'question'

  useNarration(isQuestion ? game.currentAudioUrl : undefined, muted)

  async function run(name: string, params: Record<string, unknown> = {}) {
    setBusy(name)
    const res = await callAction(name, { gameId, ...params })
    setBusy('')
    if (!res.success) error('Hmm', res.error)
    return res.success
  }

  // Auto-reveal when time runs out or everyone has answered — once per question.
  useTicker(250, isQuestion)
  const revealedFor = useRef(-1)
  const timeUp = isQuestion && serverNow() >= game.questionEndsAt
  const allIn = isQuestion && players.length > 0 && answered >= players.length
  useEffect(() => {
    if (!isQuestion || revealedFor.current === game.currentIndex) return
    if (!timeUp && !allIn) return
    revealedFor.current = game.currentIndex
    void run('revealAnswer', { questionIndex: game.currentIndex }).then((ok) => {
      if (!ok) revealedFor.current = -1
    })
  }, [isQuestion, timeUp, allIn, game.currentIndex])

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${game.code}` : ''

  const endButton = game.status !== 'finished' && (
    <Button
      variant="ghost"
      size="sm"
      className={cn(confirmEnd && 'text-destructive')}
      onClick={() => (confirmEnd ? void run('endGame') : setConfirmEnd(true))}
      onBlur={() => setConfirmEnd(false)}
      disabled={!!busy}
    >
      <Flag /> {confirmEnd ? 'Click again to end now' : 'End game'}
    </Button>
  )

  if (game.status === 'lobby') {
    return (
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
        <Panel className="flex flex-col items-center gap-6 py-10 text-center">
          <p className="break-words text-sm font-semibold uppercase tracking-widest text-muted-foreground">Join at {window.location.host} with code</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(joinUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="group flex max-w-full items-center gap-2 font-mono text-4xl font-bold tracking-[0.15em] text-primary min-[400px]:text-5xl sm:gap-3 sm:text-6xl sm:tracking-[0.2em] lg:text-7xl"
            data-testid="join-code"
            title="Copy join link"
          >
            {game.code}
            {copied ? <Check className="h-6 w-6 text-success" /> : <Copy className="h-6 w-6 opacity-0 transition group-hover:opacity-60" />}
          </button>
          <QrCode value={joinUrl} />
          <p className="max-w-sm text-sm text-muted-foreground">Scan to join, or open the link on any phone. You’re the presenter — put this screen where everyone can see it.</p>
        </Panel>
        <Panel className="flex flex-col">
          <h2 className="mb-3 font-display text-lg font-bold">Players ({players.length})</h2>
          <div className="flex-1">
            {players.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for players…</p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-testid="lobby-players">
                {players.map((p) => (
                  <li key={p.userId} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium animate-pop">
                    <span className={cn('h-2 w-2 rounded-full', online(p.userId) ? 'bg-success' : 'bg-muted-foreground/40')} />
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-6 flex flex-wrap-reverse items-center justify-between gap-3">
            {endButton}
            <Button size="lg" className="h-12 rounded-full px-7 text-base" disabled={players.length === 0 || !!busy} onClick={() => run('startGame')} data-testid="start-game">
              {busy === 'startGame' ? <Loader2 className="animate-spin" /> : <Play />} Start game
            </Button>
          </div>
        </Panel>
      </div>
    )
  }

  if (game.status === 'finished') {
    return <FinalScreen game={game} players={players} gameId={gameId} />
  }

  const revealed = game.status === 'reveal'
  const maxCount = Math.max(1, ...counts)
  const isLast = game.currentIndex + 1 >= game.totalQuestions

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      <Panel className="space-y-5">
        <Countdown startedAt={game.questionStartedAt} endsAt={game.questionEndsAt} frozen={revealed} />
        <p className="font-display text-2xl font-bold leading-snug sm:text-4xl" data-testid="question-prompt">{game.currentPrompt}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((o, i) => (
            <OptionTile
              key={i}
              index={i}
              text={o}
              size="lg"
              state={revealed ? (i === game.revealedIndex ? 'correct' : 'dim') : 'idle'}
              count={revealed ? (counts[i] ?? 0) : undefined}
              maxCount={revealed ? maxCount : undefined}
            />
          ))}
        </div>
        {revealed && game.revealedExplanation && (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-muted-foreground animate-rise">
            <span className="font-semibold text-foreground">Why: </span>{game.revealedExplanation}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-1">
            {game.currentAudioUrl && (
              <>
                <Button variant="ghost" size="icon" aria-label={muted ? 'Unmute narration' : 'Mute narration'} onClick={() => setMuted((m) => !m)}>
                  {muted ? <VolumeX /> : <Volume2 />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Replay narration" onClick={() => playClip(game.currentAudioUrl)}>
                  <RotateCcw />
                </Button>
              </>
            )}
            {endButton}
          </div>
          {revealed ? (
            <Button size="lg" className="h-12 rounded-full px-7 text-base" onClick={() => run('nextQuestion')} disabled={!!busy} data-testid="next-question">
              {busy === 'nextQuestion' ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {isLast ? 'Final results' : 'Next question'}
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <span className="font-mono text-lg font-bold" data-testid="answered-count">{answered}/{players.length} <span className="font-sans text-sm font-normal text-muted-foreground">answered</span></span>
              <Button variant="secondary" onClick={() => run('revealAnswer', { questionIndex: game.currentIndex })} disabled={!!busy}>
                Reveal now
              </Button>
            </div>
          )}
        </div>
      </Panel>
      <Panel>
        <h2 className="mb-3 font-display text-lg font-bold">{revealed ? 'Leaderboard' : 'Scores'}</h2>
        <Leaderboard players={players} limit={10} showDelta={revealed} online={online} />
      </Panel>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Player
// ═══════════════════════════════════════════════════════════════════════════

function PlayerView({
  gameId,
  game,
  players,
  me,
  online,
}: {
  gameId: string
  game: Game
  players: Player[]
  me: Player
  online: (id: string) => boolean
}) {
  const { error } = useToast()
  const answersQ = useQuery<Answer>('answers', { where: { gameId, userId: me.userId }, limit: 100 })
  const myChoices = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of answersQ.records) m.set(a.data.questionIndex, a.data.choice)
    return m
  }, [answersQ.records])
  const [pending, setPending] = useState<{ index: number; choice: number } | null>(null)
  const [muted, setMuted] = useState(true) // the host screen narrates by default
  const options = parseJsonArray<string>(game.currentOptions)

  useNarration(game.status === 'question' ? game.currentAudioUrl : undefined, muted)

  const myChoice =
    myChoices.get(game.currentIndex) ?? (pending?.index === game.currentIndex ? pending.choice : undefined)

  async function answer(choice: number) {
    if (myChoice !== undefined) return
    setPending({ index: game.currentIndex, choice })
    const res = await callAction('submitAnswer', { gameId, questionIndex: game.currentIndex, choice })
    if (!res.success) {
      setPending(null)
      error('Not counted', res.error)
    }
  }

  const rank = rankPlayers(players).find((p) => p.userId === me.userId)?.rank

  if (game.status === 'lobby') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Panel className="py-10 text-center">
          <div className="mx-auto mb-4 grid w-fit grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <OptionShape key={i} index={i} className={cn('h-8 w-8 animate-pulse', ['text-opt-0', 'text-opt-1', 'text-opt-2', 'text-opt-3'][i])} />
            ))}
          </div>
          <p className="font-display text-3xl font-extrabold">You’re in, {me.name}!</p>
          <p className="mt-2 text-muted-foreground">Waiting for {game.hostName} to start…</p>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">In the lobby</h2>
          <ul className="flex flex-wrap gap-2">
            {players.map((p) => (
              <li key={p.userId} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-sm', p.userId === me.userId ? 'bg-primary/15' : 'bg-secondary')}>
                <span className={cn('h-2 w-2 rounded-full', online(p.userId) ? 'bg-success' : 'bg-muted-foreground/40')} />
                {p.name}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    )
  }

  if (game.status === 'finished') {
    return <FinalScreen game={game} players={players} meId={me.userId} myChoices={myChoices} gameId={gameId} />
  }

  const revealed = game.status === 'reveal'
  const correct = revealed && myChoice === game.revealedIndex
  const stateFor = (i: number): OptionState => {
    if (revealed) {
      if (i === game.revealedIndex) return 'correct'
      if (i === myChoice) return 'wrong'
      return 'dim'
    }
    if (myChoice === undefined) return 'idle'
    return i === myChoice ? 'selected' : 'dim'
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {revealed && (
        <div
          className={cn(
            'rounded-3xl p-5 text-center animate-pop',
            correct ? 'bg-success text-white' : 'bg-destructive/90 text-white',
          )}
          data-testid="reveal-banner"
        >
          <p className="font-display text-3xl font-extrabold">
            {correct ? 'Correct!' : myChoice === undefined ? 'Too slow!' : 'Not quite'}
          </p>
          <p className="mt-1 font-mono text-lg">
            {correct ? `+${me.lastPoints}` : '+0'}
            {correct && me.streak > 1 ? ` · 🔥 ${me.streak} streak` : ''}
            {rank ? ` · #${rank} of ${players.length}` : ''}
          </p>
        </div>
      )}

      <Panel className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Countdown startedAt={game.questionStartedAt} endsAt={game.questionEndsAt} frozen={revealed} />
          </div>
          {game.currentAudioUrl && (
            <Button variant="ghost" size="icon" aria-label={muted ? 'Read questions aloud on this device' : 'Mute narration'} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
          )}
        </div>
        <p className="font-display text-xl font-bold leading-snug sm:text-2xl" data-testid="question-prompt">{game.currentPrompt}</p>
        <div className="grid gap-2.5">
          {options.map((o, i) => (
            <OptionTile
              key={i}
              index={i}
              text={o}
              state={stateFor(i)}
              onClick={!revealed && myChoice === undefined ? () => answer(i) : undefined}
              disabled={revealed || myChoice !== undefined}
            />
          ))}
        </div>
        {!revealed && myChoice !== undefined && (
          <p className="text-center font-semibold text-muted-foreground animate-rise" data-testid="locked-in">
            Locked in — waiting for the others…
          </p>
        )}
        {revealed && game.revealedExplanation && (
          <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground animate-rise">
            <span className="font-semibold text-foreground">Why: </span>{game.revealedExplanation}
          </p>
        )}
      </Panel>

      {revealed && (
        <Panel>
          <Leaderboard players={players} meId={me.userId} limit={5} showDelta />
        </Panel>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Final results (host + players)
// ═══════════════════════════════════════════════════════════════════════════

function FinalScreen({
  game,
  players,
  meId,
  myChoices,
  gameId,
}: {
  game: Game
  players: Player[]
  meId?: string
  myChoices?: Map<number, number>
  gameId?: string
}) {
  const review = parseJsonArray<ReviewItem>(game.reviewJson).slice(0, Math.max(0, game.currentIndex + 1))
  const me = players.find((p) => p.userId === meId)
  const rank = rankPlayers(players).find((p) => p.userId === meId)?.rank
  // The deck's study kit unlocks for everyone in the game once it ends.
  const { kit } = useGameKit(gameId)
  const terms = new Map((kit?.concepts ?? []).map((c) => [c.id, c.term]))
  const kitHref = `/kit/${game.code}`
  return (
    <div className="space-y-6">
      <Panel className="space-y-6 py-8 text-center">
        <p className="font-display text-4xl font-extrabold">Final results</p>
        {me && (
          <p className="text-muted-foreground">
            You finished <span className="font-bold text-foreground">#{rank}</span> with{' '}
            <span className="font-bold text-foreground">{me.score}</span> points ·{' '}
            {me.correctCount}/{review.length} correct
          </p>
        )}
        <Podium players={players} />
      </Panel>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          {kit && (
            <Link
              to={kitHref}
              data-testid="open-kit"
              className="flex items-center gap-4 rounded-3xl bg-primary p-5 text-primary-foreground transition hover:brightness-105"
            >
              <BookOpen className="h-8 w-8 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-extrabold">Open the study kit</span>
                <span className="block text-sm opacity-80">Summary, key concepts, cheat sheet and concept map for this quiz</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Link>
          )}
          {me && gameId && <RecapCard gameId={gameId} />}
          <Panel>
            <h2 className="mb-3 font-display text-lg font-bold">Everyone</h2>
            <Leaderboard players={players} meId={meId} />
          </Panel>
          <Link to="/home" className="block text-center font-semibold text-primary hover:underline">Back home</Link>
        </div>
        <Panel>
          <h2 className="mb-3 font-display text-lg font-bold">Review</h2>
          <ol className="space-y-3" data-testid="review-list">
            {review.map((q, i) => {
              const mine = myChoices?.get(i)
              const right = mine === q.correctIndex
              return (
                <li key={i} className="rounded-2xl bg-secondary/60 p-4">
                  <div className="flex items-start gap-2">
                    {myChoices && (
                      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', right ? 'bg-success' : 'bg-destructive')}>
                        {right ? '✓' : '✗'}
                      </span>
                    )}
                    <p className="font-semibold leading-snug">{i + 1}. {q.prompt}</p>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="text-success">✓ {q.options[q.correctIndex]}</span>
                    {myChoices && !right && (
                      <span className="ml-3 text-destructive">
                        {mine === undefined ? 'No answer' : `Your answer: ${q.options[mine]}`}
                      </span>
                    )}
                  </p>
                  {q.explanation && <p className="mt-1 text-sm text-muted-foreground">{q.explanation}</p>}
                  {q.conceptId && terms.has(q.conceptId) && (!myChoices || !right) && (
                    <Link
                      to={`${kitHref}#${conceptAnchor(q.conceptId)}`}
                      data-testid="review-concept"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      {myChoices ? 'Review' : 'Concept'}: {terms.get(q.conceptId)} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        </Panel>
      </div>
    </div>
  )
}

function RecapCard({ gameId }: { gameId: string }) {
  const { error } = useToast()
  const recaps = useQuery<{ text: string }>('recaps', { where: { gameId }, limit: 1 })
  const [loading, setLoading] = useState(false)
  const [local, setLocal] = useState('')
  const text = recaps.records[0]?.data.text || local

  async function generate() {
    setLoading(true)
    const res = await callAction<{ text: string }>('getRecap', { gameId }, 90_000)
    setLoading(false)
    if (!res.success) return error('Couldn’t write your recap', res.error)
    setLocal(res.data.text)
  }

  return (
    <Panel className="border-primary/40 bg-primary/5">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
        <Sparkles className="h-5 w-5 text-primary" /> Your study recap
      </h2>
      {text ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="recap-text">{text}</div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            A private, AI-written review of the concepts behind the questions you missed — with a couple of quick self-test prompts.
          </p>
          <Button onClick={generate} disabled={loading} data-testid="get-recap">
            {loading ? <><Loader2 className="animate-spin" /> Writing…</> : 'Get my recap'}
          </Button>
        </>
      )}
    </Panel>
  )
}
