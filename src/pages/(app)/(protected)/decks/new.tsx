import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useR2Files } from 'deepspace'
import { FileText, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { Button, Switch, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction } from '@/lib/callAction'
import { ACCEPTED_FILES, extractText } from '@/lib/extractText'
import {
  MAX_QUESTIONS,
  MAX_SOURCE_CHARS,
  MIN_QUESTIONS,
  MIN_SOURCE_CHARS,
  type Difficulty,
} from '@/lib/game-logic'
import { Panel } from '@/components/game/GameUI'

const DIFFICULTIES: Array<{ id: Difficulty; label: string; hint: string }> = [
  { id: 'easy', label: 'Warm-up', hint: 'Key terms and facts' },
  { id: 'medium', label: 'Standard', hint: 'Recall + understanding' },
  { id: 'hard', label: 'Exam mode', hint: 'Application & traps' },
]

export default function NewDeckPage() {
  const navigate = useNavigate()
  const { error } = useToast()
  // Originals go to the uploader's private storage; only extracted text is sent for generation.
  const { upload } = useR2Files()
  const inputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [narrate, setNarrate] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function takeFile(f: File) {
    if (f.size > 20 * 1024 * 1024) return error('That file is over 20 MB')
    setReading(true)
    try {
      const extracted = await extractText(f)
      setFile(f)
      setText(extracted.slice(0, MAX_SOURCE_CHARS))
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120))
    } catch (err) {
      error('Couldn’t read that file', err instanceof Error ? err.message : undefined)
    } finally {
      setReading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void takeFile(f)
  }

  async function submit() {
    setSubmitting(true)
    let sourceKey = ''
    if (file) {
      // Keeping the original is a convenience; generation never depends on it.
      try {
        const res = await upload(file, file.name)
        if (res.success && res.key) sourceKey = res.key
      } catch {
        /* non-fatal */
      }
    }
    const res = await callAction<{ deckId: string }>('createDeck', {
      title,
      sourceName: file?.name ?? 'Pasted notes',
      sourceKey,
      sourceText: text,
      questionCount: count,
      difficulty,
      narrate,
    })
    setSubmitting(false)
    if (!res.success) return error('Couldn’t start generating', res.error)
    navigate(`/decks/${res.data.deckId}`)
  }

  const chars = text.trim().length
  const tooShort = chars < MIN_SOURCE_CHARS
  const truncated = chars >= MAX_SOURCE_CHARS

  return (
    <div className="min-h-full bg-grain">
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:py-12">
        <header>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">New quiz from your notes</h1>
          <p className="mt-2 text-muted-foreground">
            Questions are written only from what you provide, so better notes make a better game.
          </p>
        </header>

        <Panel className="space-y-5">
          <div>
            <label htmlFor="deck-title" className="mb-1.5 block text-sm font-semibold">
              Name <span className="font-normal text-muted-foreground">(optional — we’ll suggest one)</span>
            </label>
            <input
              id="deck-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="BIO 201 — Week 4: Cell respiration"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'rounded-2xl border-2 border-dashed p-5 transition',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{chars.toLocaleString()} characters extracted</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove file"
                  onClick={() => {
                    setFile(null)
                    setText('')
                  }}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 py-4 text-center"
                disabled={reading}
              >
                {reading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                <span className="font-semibold">{reading ? 'Reading your file…' : 'Drop a PDF, Word doc or text file'}</span>
                <span className="text-sm text-muted-foreground">or click to browse · up to 20 MB</span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FILES}
              className="hidden"
              data-testid="notes-file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void takeFile(f)
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="notes" className="text-sm font-semibold">
                {file ? 'Extracted text (edit if needed)' : 'Or paste your notes'}
              </label>
              <span className={cn('font-mono text-xs', tooShort ? 'text-muted-foreground' : 'text-success')}>
                {chars.toLocaleString()} / {MAX_SOURCE_CHARS.toLocaleString()}
              </span>
            </div>
            <textarea
              id="notes"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_SOURCE_CHARS))}
              rows={9}
              placeholder="Paste lecture notes, a textbook section, a study guide…"
              className="w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
            />
            {tooShort && chars > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">Add at least {MIN_SOURCE_CHARS} characters.</p>
            )}
            {truncated && <p className="mt-1 text-sm text-warning">Long document — only the first {MAX_SOURCE_CHARS.toLocaleString()} characters are used.</p>}
          </div>
        </Panel>

        <Panel className="space-y-6">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="count" className="text-sm font-semibold">Questions</label>
              <span className="font-mono text-lg font-bold">{count}</span>
            </div>
            <input
              id="count"
              type="range"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Difficulty</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    difficulty === d.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary',
                  )}
                >
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{d.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Read questions aloud</span>
              <span className="block text-sm text-muted-foreground">
                Records a narrator voice for each question — great when the host screen is on a TV.
              </span>
            </span>
            <Switch checked={narrate} onCheckedChange={(v) => setNarrate(Boolean(v))} />
          </label>
        </Panel>

        <div className="flex justify-end">
          <Button
            size="lg"
            className="h-12 rounded-full px-7 text-base"
            disabled={tooShort || submitting || reading}
            onClick={submit}
            data-testid="generate-deck"
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Generate quiz
          </Button>
        </div>
      </div>
    </div>
  )
}
