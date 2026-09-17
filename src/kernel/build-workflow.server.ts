import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { BuildJobs } from './build-jobs.server'
import { createPostgresClient } from '../lib/db.server'
import type { KernelEnv } from '../lib/env.server'

type Payload = { jobId: string }

export class ApplicationBuildWorkflow extends WorkflowEntrypoint<KernelEnv, Payload> {
  async run(event: WorkflowEvent<Payload>, step: WorkflowStep) {
    for (let i = 0; i < 32; i++) {
      const tick = await step.do(`build-${i}`, async () => {
        const connectionString = this.env.HYPERDRIVE?.connectionString || this.env.DATABASE_URL || ''
        const db = createPostgresClient(connectionString)
        try {
          const progressed = await new BuildJobs(db).runOne(event.payload.jobId)
          const job = await db.buildJob.findUnique({ where: { id: event.payload.jobId } })
          return { progressed, status: job?.status ?? 'missing' }
        } finally {
          await db.$disconnect()
        }
      })
      if (['completed', 'failed', 'superseded', 'missing'].includes(tick.status)) return
      if (!tick.progressed) await step.sleep(`wait-${i}`, '5 seconds')
    }
  }
}
