/**
 * Background-job dispatcher — invoked by AppJobRoom (worker.ts).
 *
 * Job types:
 *   - 'generate-deck': notes → quiz questions → narration + cover art.
 *     Enqueued by the `createDeck` action.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { runGenerateDeck, type GenerateDeckPayload } from './server/generate-deck'

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  switch (job.type) {
    case 'generate-deck':
      return await runGenerateDeck(job.payload as GenerateDeckPayload, ctx, env)
    default:
      throw new Error(`unknown_job_type: ${job.type}`)
  }
}
