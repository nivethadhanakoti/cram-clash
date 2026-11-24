/**
 * The study kit: summary, key concepts, printable cheat sheet, concept map.
 * Used by the deck owner (deck page) and by players after a game (/kit/CODE).
 * Concepts have stable anchors (#concept-<id>) so a missed question can
 * link straight to what to review.
 */

import { useEffect } from 'react'
import { BookOpen, Lightbulb, Network, Printer, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CheatSection, KitConcept, StudyKit } from '@/lib/kit-logic'
import { ConceptMap } from './ConceptMap'

export type KitContent = Pick<StudyKit, 'summary' | 'concepts' | 'cheatSheet' | 'conceptMap'>

const SECTIONS = [
  { id: 'kit-summary', label: 'Summary', icon: BookOpen },
  { id: 'kit-concepts', label: 'Key concepts', icon: Lightbulb },
  { id: 'kit-cheatsheet', label: 'Cheat sheet', icon: ScrollText },
  { id: 'kit-map', label: 'Concept map', icon: Network },
] as const

export function conceptAnchor(id: string) {
  return `concept-${id}`
}

function Section({
  id,
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  id: string
  title: string
  icon: typeof BookOpen
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-24 rounded-3xl border border-border bg-card p-5 sm:p-6', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function StudyKitView({ kit, title }: { kit: KitContent; title: string }) {
  const hasMap = kit.conceptMap.nodes.length > 0
  const sections = SECTIONS.filter((s) => {
    if (s.id === 'kit-summary') return !!kit.summary
    if (s.id === 'kit-concepts') return kit.concepts.length > 0
    if (s.id === 'kit-cheatsheet') return kit.cheatSheet.length > 0
    return hasMap
  })

  // Deep links (#concept-…) scroll once the kit has rendered, and flash.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (!hash) return
    const el = document.getElementById(hash)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-primary')
    const t = setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 2400)
    return () => clearTimeout(t)
  }, [kit])

  return (
    <div className="space-y-5" data-testid="study-kit">
      <nav aria-label="Study kit sections" className="sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto bg-background/85 px-1 py-2 backdrop-blur print:hidden">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium transition hover:bg-secondary"
          >
            <s.icon className="h-4 w-4 text-primary" /> {s.label}
          </a>
        ))}
      </nav>

      {kit.summary && (
        <Section id="kit-summary" title="Summary" icon={BookOpen}>
          <div className="max-w-prose space-y-3 leading-relaxed text-foreground/90">
            {kit.summary.split(/\n\s*\n/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </Section>
      )}

      {kit.concepts.length > 0 && (
        <Section id="kit-concepts" title="Key concepts" icon={Lightbulb}>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {kit.concepts.map((c, i) => (
              <ConceptCard key={c.id} concept={c} n={i + 1} />
            ))}
          </ol>
        </Section>
      )}

      {kit.cheatSheet.length > 0 && (
        <Section
          id="kit-cheatsheet"
          title="Cheat sheet"
          icon={ScrollText}
          className="print-area"
          action={
            <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer /> Print / save PDF
            </Button>
          }
        >
          <p className="mb-3 hidden font-display text-lg font-bold print:block">{title} — cheat sheet</p>
          <CheatSheet sections={kit.cheatSheet} />
        </Section>
      )}

      {hasMap && (
        <Section id="kit-map" title="Concept map" icon={Network}>
          <ConceptMap map={kit.conceptMap} />
        </Section>
      )}
    </div>
  )
}

function ConceptCard({ concept, n }: { concept: KitConcept; n: number }) {
  return (
    <li
      id={conceptAnchor(concept.id)}
      className="scroll-mt-24 rounded-2xl bg-secondary/60 p-4 transition-shadow"
      data-testid="kit-concept"
    >
      <p className="flex items-baseline gap-2 font-semibold">
        <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, '0')}</span>
        <span className="min-w-0 break-words">{concept.term}</span>
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{concept.explanation}</p>
      {concept.example && (
        <p className="mt-2 border-l-2 border-primary/60 pl-3 text-sm italic text-muted-foreground">{concept.example}</p>
      )}
    </li>
  )
}

function CheatSheet({ sections }: { sections: CheatSection[] }) {
  return (
    <div className="columns-1 gap-6 sm:columns-2 xl:columns-3 print:columns-2">
      {sections.map((s) => (
        <div key={s.heading} className="mb-5 break-inside-avoid">
          <h3 className="mb-1.5 font-mono text-xs font-bold uppercase tracking-widest text-primary print:text-black">
            {s.heading}
          </h3>
          <ul className="space-y-1 text-sm leading-snug">
            {s.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
