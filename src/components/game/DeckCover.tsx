import { cn } from '@/lib/utils'
import { OptionShape } from './GameUI'

/** Deck art: the Gemini cover when present, otherwise a shape pattern. */
export function DeckCover({ url, title, className }: { url?: string; title: string; className?: string }) {
  if (url) {
    return <img src={url} alt="" className={cn('aspect-video w-full object-cover', className)} loading="lazy" />
  }
  // Deterministic pattern from the title so each deck looks distinct.
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const first = h % 4
  return (
    <div
      aria-hidden
      className={cn('relative flex aspect-video w-full items-center justify-center overflow-hidden', ['bg-opt-0/15', 'bg-opt-1/15', 'bg-opt-2/20', 'bg-opt-3/15'][first], className)}
    >
      <div className="grid grid-cols-2 gap-3 opacity-80">
        {[0, 1, 2, 3].map((i) => (
          <OptionShape key={i} index={(first + i) % 4} className={cn('h-9 w-9', ['text-opt-0', 'text-opt-1', 'text-opt-2', 'text-opt-3'][(first + i) % 4])} />
        ))}
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
}

export function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'ready'
      ? 'bg-success/15 text-success'
      : status === 'failed'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-primary/15 text-primary'
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
