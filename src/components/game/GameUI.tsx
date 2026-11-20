/**
 * Presentational pieces shared by the host and player game screens.
 */

import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { serverNow } from '@/lib/callAction'
import { rankPlayers } from '@/lib/game-logic'

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
const OPTION_BG = ['bg-opt-0', 'bg-opt-1', 'bg-opt-2', 'bg-opt-3'] as const
const OPTION_TEXT = ['text-opt-0', 'text-opt-1', 'text-opt-2', 'text-opt-3'] as const

/** Each answer has a shape as well as a color, so it reads without color. */
export function OptionShape({ index, className }: { index: number; className?: string }) {
  const common = { className: cn('h-5 w-5 shrink-0', className), viewBox: '0 0 20 20', 'aria-hidden': true }
  switch (index) {
    case 0:
      return <svg {...common}><path d="M10 2 19 18H1Z" fill="currentColor" /></svg>
    case 1:
      return <svg {...common}><path d="M10 1 19 10 10 19 1 10Z" fill="currentColor" /></svg>
    case 2:
      return <svg {...common}><circle cx="10" cy="10" r="8.5" fill="currentColor" /></svg>
    default:
      return <svg {...common}><rect x="2" y="2" width="16" height="16" rx="2" fill="currentColor" /></svg>
  }
}

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'

export function OptionTile({
  index,
  text,
  state = 'idle',
  onClick,
  disabled,
  count,
  maxCount,
  size = 'md',
}: {
  index: number
  text: string
  state?: OptionState
  onClick?: () => void
  disabled?: boolean
  count?: number
  maxCount?: number
  size?: 'md' | 'lg'
}) {
  const interactive = !!onClick && !disabled
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={onClick ? disabled : undefined}
      data-testid={`option-${index}`}
      className={cn(
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-4 text-left font-semibold text-[#160f02] transition-all duration-200',
        size === 'lg' ? 'min-h-24 py-5 text-lg sm:text-xl' : 'min-h-16 py-4 text-base',
        OPTION_BG[index],
        interactive && 'hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[.99]',
        state === 'selected' && 'ring-4 ring-foreground/90 ring-offset-2 ring-offset-background',
        state === 'correct' && 'ring-4 ring-foreground ring-offset-2 ring-offset-background',
        state === 'dim' && 'opacity-35 saturate-50',
        state === 'wrong' && 'opacity-80 ring-4 ring-destructive ring-offset-2 ring-offset-background',
        disabled && !onClick && 'cursor-default',
      )}
    >
      {typeof count === 'number' && maxCount !== undefined && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-700"
          style={{ width: `${maxCount ? (count / maxCount) * 100 : 0}%` }}
        />
      )}
      <span className="relative flex items-center gap-2">
        <OptionShape index={index} className="text-[#160f02]/80" />
        <span className="sr-only">{OPTION_LETTERS[index]}.</span>
      </span>
      <span className="relative flex-1 leading-snug">{text}</span>
      {typeof count === 'number' && (
        <span className="relative rounded-full bg-black/20 px-2.5 py-0.5 font-mono text-sm">{count}</span>
      )}
      {state === 'correct' && <Check className="relative h-6 w-6 shrink-0" strokeWidth={3} aria-label="Correct answer" />}
      {state === 'wrong' && <X className="relative h-6 w-6 shrink-0" strokeWidth={3} aria-label="Your answer" />}
    </Comp>
  )
}

/** Re-render on an interval (for countdowns). */
export function useTicker(ms: number, active = true) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms, active])
}

export function secondsLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - serverNow()) / 1000))
}

export function Countdown({ startedAt, endsAt, frozen }: { startedAt: number; endsAt: number; frozen?: boolean }) {
  useTicker(100, !frozen)
  const total = Math.max(1, endsAt - startedAt)
  const left = Math.max(0, endsAt - serverNow())
  const pct = frozen ? 0 : (left / total) * 100
  const secs = frozen ? 0 : Math.ceil(left / 1000)
  const urgent = !frozen && secs <= 5
  return (
    <div className="flex items-center gap-3" data-testid="countdown">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', urgent ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn('w-10 text-right font-mono text-xl font-bold tabular-nums', urgent && 'text-destructive')}
        aria-live="polite"
      >
        {secs}
      </span>
    </div>
  )
}

export interface BoardPlayer {
  userId: string
  name: string
  score: number
  correctCount: number
  lastPoints?: number
}

export function Leaderboard({
  players,
  meId,
  limit,
  showDelta,
  online,
}: {
  players: BoardPlayer[]
  meId?: string | null
  limit?: number
  showDelta?: boolean
  online?: (userId: string) => boolean
}) {
  const ranked = rankPlayers(players)
  const shown = limit ? ranked.slice(0, limit) : ranked
  const me = ranked.find((p) => p.userId === meId)
  const meHidden = me && !shown.includes(me)
  const row = (p: (typeof ranked)[number]) => (
    <li
      key={p.userId}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 animate-rise',
        p.userId === meId ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold',
          p.rank === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {p.rank}
      </span>
      {online && (
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', online(p.userId) ? 'bg-success' : 'bg-muted-foreground/40')}
          title={online(p.userId) ? 'Connected' : 'Away'}
        />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">
        {p.name}
        {p.userId === meId && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
      </span>
      {showDelta && !!p.lastPoints && (
        <span className="font-mono text-sm font-bold text-success">+{p.lastPoints}</span>
      )}
      <span className="w-16 text-right font-mono font-bold tabular-nums">{p.score}</span>
    </li>
  )
  if (ranked.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No players yet.</p>
  }
  return (
    <ol className="space-y-1.5" data-testid="leaderboard">
      {shown.map(row)}
      {meHidden && (
        <>
          <li className="px-3 text-center text-muted-foreground">⋯</li>
          {row(me)}
        </>
      )}
    </ol>
  )
}

export function Podium({ players }: { players: BoardPlayer[] }) {
  const top = rankPlayers(players).slice(0, 3)
  const order = [top[1], top[0], top[2]]
  const heights = ['h-24', 'h-32', 'h-16']
  return (
    <div className="flex items-end justify-center gap-3" data-testid="podium">
      {order.map((p, i) =>
        p ? (
          <div key={p.userId} className="flex w-28 flex-col items-center gap-2 animate-pop" style={{ animationDelay: `${[200, 500, 0][i]}ms` }}>
            <span className="max-w-full truncate text-sm font-semibold">{p.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{p.score} pts</span>
            <div
              className={cn(
                'flex w-full items-start justify-center rounded-t-2xl pt-2 font-display text-3xl font-extrabold',
                heights[i],
                i === 1 ? 'bg-primary text-primary-foreground' : 'bg-secondary',
              )}
            >
              {p.rank}
            </div>
          </div>
        ) : (
          <div key={i} className="w-28" />
        ),
      )}
    </div>
  )
}

export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#13111c', light: '#f6f0e4' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''))
    return () => {
      alive = false
    }
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} className="rounded-xl bg-muted" />
  return <img src={src} width={size} height={size} alt={`QR code to join: ${value}`} className="rounded-xl" />
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl border border-border bg-card p-5 sm:p-6', className)}>{children}</div>
}

/** Plays a narration clip whenever `src` changes, unless muted. */
export function useNarration(src: string | undefined, muted: boolean) {
  useEffect(() => {
    if (!src || muted) return
    const audio = new Audio(src)
    audio.play().catch(() => {
      /* autoplay blocked — the replay button still works */
    })
    return () => {
      audio.pause()
    }
  }, [src, muted])
}

export function playClip(src: string) {
  new Audio(src).play().catch(() => {})
}

export { OPTION_TEXT }
