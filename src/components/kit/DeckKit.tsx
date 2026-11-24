/** Deck owner's view of the study kit: live status, create/retry, content. */

import { useMemo, useState } from 'react'
import { useQuery } from 'deepspace'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/callAction'
import { parseKitField, type CheatSection, type KitConcept, type StudyKit } from '@/lib/kit-logic'
import { StudyKitView } from './StudyKitView'

interface KitRow {
  deckId: string
  status: string
  statusMessage: string
  summary: string
  concepts: string
  cheatSheet: string
  conceptMap: string
}

export function DeckKit({ deckId, title }: { deckId: string; title: string }) {
  const { error } = useToast()
  const kits = useQuery<KitRow>('kits', { where: { deckId }, limit: 1 })
  const [busy, setBusy] = useState(false)
  const row = kits.records[0]?.data

  const kit = useMemo(
    () =>
      row?.status === 'ready'
        ? {
            summary: row.summary,
            concepts: parseKitField<KitConcept[]>(row.concepts, []),
            cheatSheet: parseKitField<CheatSection[]>(row.cheatSheet, []),
            conceptMap: parseKitField<StudyKit['conceptMap']>(row.conceptMap, { nodes: [], edges: [] }),
          }
        : null,
    [row],
  )

  async function create() {
    setBusy(true)
    const res = await callAction('createKit', { deckId })
    setBusy(false)
    if (!res.success) error('Couldn’t start the study kit', res.error)
  }

  if (kits.status === 'loading') {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  if (kit) return <StudyKitView kit={kit} title={title} />

  const generating = row?.status === 'generating'
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center" data-testid="kit-status">
      {generating ? (
        <>
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 font-semibold">{row?.statusMessage || 'Writing your study kit…'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Summary, key concepts, a cheat sheet and a concept map. Usually under a minute.</p>
        </>
      ) : (
        <>
          <Sparkles className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 font-semibold">
            {row?.status === 'failed' ? row.statusMessage : 'Turn these notes into a study kit'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A summary, key concepts explained, a printable cheat sheet and a concept map — shared with your players when the game ends.
          </p>
          <Button className="mt-4" onClick={create} disabled={busy} data-testid="create-kit">
            {busy ? <Loader2 className="animate-spin" /> : row?.status === 'failed' ? <RotateCcw /> : <Sparkles />}
            {row?.status === 'failed' ? 'Try again' : 'Create study kit'}
          </Button>
        </>
      )}
    </div>
  )
}
