/**
 * Background-job dispatcher — invoked by AppJobRoom (worker.ts).
 *
 * Job types:
 *   - 'generate-deck': notes → quiz questions → narration + cover art.
 *     Enqueued by the `createDeck` action. Also writes the study kit.
 *   - 'generate-kit': (re)generate just the study kit for an existing deck.
 *     Enqueued by the `createKit` action.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { runGenerateDeck, type GenerateDeckPayload } from './server/generate-deck'
import { runGenerateKit, type GenerateKitPayload } from './server/generate-kit'

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  switch (job.type) {
    case 'generate-deck':
      return await runGenerateDeck(job.payload as GenerateDeckPayload, ctx, env)
    case 'generate-kit':
      return await runGenerateKit(job.payload as GenerateKitPayload, ctx, env)
    default:
      throw new Error(`unknown_job_type: ${job.type}`)
  }
}
