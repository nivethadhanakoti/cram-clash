import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useR2Files } from 'deepspace'
import { ArrowLeft, Download, Loader2, Play, RotateCcw, Trash2, Volume2 } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '@/lib/callAction'
import { parseJsonArray } from '@/lib/game-logic'
import { DeckCover, StatusChip } from '@/components/game/DeckCover'
import { OptionShape, Panel, playClip } from '@/components/game/GameUI'
import { DeckKit } from '@/components/kit/DeckKit'

interface Deck {
  title: string
  sourceName: string
  sourceKey: string
  status: string
  progress: number
  statusMessage: string
  summary: string
  coverUrl: string
  questionCount: number
  difficulty: string
  narrate: number
}
interface Question {
  deckId: string
  idx: number
  prompt: string
  options: string
  correctIndex: number
  explanation: string
  audioUrl: string
}

const SECONDS = [10, 20, 30, 45]

export default function DeckPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { error, success } = useToast()
  const { downloadFile } = useR2Files()
  const decks = useQuery<Deck>('decks', { limit: 200 })
  const questions = useQuery<Question>('questions', { where: { deckId: id }, orderBy: 'idx', orderDir: 'asc', limit: 100 })
  const [seconds, setSeconds] = useState(20)
  const [busy, setBusy] = useState<'' | 'host' | 'retry' | 'delete'>('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'kit' | 'key'>('kit')

  const deck = decks.records.find((d) => d.recordId === id)

  if (decks.status === 'loading') {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  if (!deck) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="font-semibold">Quiz not found</p>
        <Link to="/home" className="mt-3 inline-block text-primary hover:underline">Back home</Link>
      </div>
    )
  }

  const d = deck.data
  const generating = d.status === 'queued' || d.status === 'generating'
  const sorted = [...questions.records].sort((a, b) => a.data.idx - b.data.idx)

  async function host() {
    setBusy('host')
    const res = await callAction<{ code: string }>('hostGame', { deckId: id, secondsPerQuestion: seconds })
    setBusy('')
    if (!res.success) return error('Couldn’t start a game', res.error)
    navigate(`/play/${res.data.code}`)
  }

  async function retry() {
    setBusy('retry')
    const res = await callAction('retryDeck', { deckId: id })
    setBusy('')
    if (!res.success) error('Couldn’t retry', res.error)
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true)
    setBusy('delete')
    const res = await callAction('deleteDeck', { deckId: id })
    setBusy('')
    if (!res.success) return error('Couldn’t delete', res.error)
    success('Quiz deleted')
    navigate('/home')
  }

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
        <Link to="/home" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All quizzes
        </Link>

        <Panel className="overflow-hidden p-0 sm:p-0">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr]">
            <DeckCover url={d.coverUrl} title={d.title || d.sourceName} className="h-full md:aspect-auto" />
            <div className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <h1 className="break-words font-display text-2xl font-extrabold leading-tight sm:text-3xl">
                  {d.title || 'Writing your quiz…'}
                </h1>
                <StatusChip status={d.status} />
              </div>
              {d.summary && <p className="text-muted-foreground">{d.summary}</p>}
              <p className="text-sm text-muted-foreground">
                {d.questionCount} questions · <span className="capitalize">{d.difficulty}</span>
                {d.narrate ? ' · narrated' : ''}
              </p>

              {(generating || (d.status === 'ready' && d.progress < 1)) && (
                <div className="space-y-1.5" data-testid="deck-progress">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round(Math.max(0.04, d.progress || 0) * 100)}%` }} />
                  </div>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {d.statusMessage || 'Working…'}
                  </p>
                </div>
              )}
              {d.status === 'ready' && d.progress >= 1 && d.statusMessage && (
                <p className="text-sm text-warning">{d.statusMessage}</p>
              )}
              {d.status === 'failed' && (
                <div className="space-y-3 rounded-xl bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{d.statusMessage}</p>
                  <Button size="sm" variant="secondary" onClick={retry} disabled={busy !== ''}>
                    {busy === 'retry' ? <Loader2 className="animate-spin" /> : <RotateCcw />} Try again
                  </Button>
                </div>
              )}

              {d.status === 'ready' && (
                <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold">Time per question</span>
                    <select
                      value={seconds}
                      onChange={(e) => setSeconds(Number(e.target.value))}
                      className="h-11 rounded-xl border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                    >
                      {SECONDS.map((s) => (
                        <option key={s} value={s}>{s} seconds</option>
                      ))}
                    </select>
                  </label>
                  <Button size="lg" className="h-11 rounded-full px-6" onClick={host} disabled={busy !== ''} data-testid="host-game">
                    {busy === 'host' ? <Loader2 className="animate-spin" /> : <Play />} Host a game
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {d.sourceKey && (
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(d.sourceKey, d.sourceName)}>
                    <Download /> Source notes
                  </Button>
                )}
                {!generating && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(confirmDelete && 'text-destructive')}
                    onClick={remove}
                    onBlur={() => setConfirmDelete(false)}
                    disabled={busy !== ''}
                  >
                    <Trash2 /> {confirmDelete ? 'Click again to delete' : 'Delete'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {d.status === 'ready' && (
          <div role="tablist" aria-label="Deck contents" className="flex w-fit gap-1 rounded-full border border-border bg-card p-1">
            {([['kit', 'Study kit'], ['key', `Answer key (${sorted.length})`]] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                data-testid={`tab-${id}`}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                  tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {d.status === 'ready' && tab === 'kit' && <DeckKit deckId={id} title={d.title} />}

        {sorted.length > 0 && (tab === 'key' || d.status !== 'ready') && (
          <section>
            <h2 className="mb-1 font-display text-xl font-bold">Answer key</h2>
            <p className="mb-4 text-sm text-muted-foreground">Only you can see this. Players get the questions one at a time, and the answers only after each reveal.</p>
            <ol className="space-y-3" data-testid="question-list">
              {sorted.map((q) => {
                const options = parseJsonArray<string>(q.data.options)
                return (
                  <li key={q.recordId} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 font-mono text-sm font-bold text-muted-foreground">{q.data.idx + 1}</span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-snug">{q.data.prompt}</p>
                          {q.data.audioUrl && (
                            <Button variant="ghost" size="icon" aria-label="Play narration" onClick={() => playClip(q.data.audioUrl)}>
                              <Volume2 />
                            </Button>
                          )}
                        </div>
                        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {options.map((o, i) => (
                            <li
                              key={i}
                              className={cn(
                                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                                i === q.data.correctIndex ? 'bg-success/15 font-semibold text-foreground ring-1 ring-success/50' : 'bg-muted text-muted-foreground',
                              )}
                            >
                              <OptionShape index={i} className={cn('h-3.5 w-3.5', ['text-opt-0', 'text-opt-1', 'text-opt-2', 'text-opt-3'][i])} />
                              {o}
                            </li>
                          ))}
                        </ul>
                        {q.data.explanation && <p className="text-sm text-muted-foreground">{q.data.explanation}</p>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
