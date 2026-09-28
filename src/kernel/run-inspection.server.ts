import { agentLimits } from './agent-limits.server'
import type { AgentRun, Prisma } from '@prisma/client'
import { agentRunSchema, runRecovery, type RunReceipt } from './agent-runs'

/** Called inside the run's authorized transaction; never joins receipts by ID alone. */
export async function inspectRun(tx: Prisma.TransactionClient, run: AgentRun) {
  const receipts = run.receipts as RunReceipt[]
  const changes = await tx.changeSet.findMany({ where: { workspaceId: run.workspaceId,
    agentCredentialId: run.agentCredentialId, id: { in: receipts.map(r => r.changeId) } } })
  const history = await tx.execution.findMany({ where: { workspaceId: run.workspaceId,
    OR: [{ action: { in: ['run.start', 'run.cancel', 'run.retry', 'run.expire', 'run.step'] }, details: { path: ['runId'], equals: run.id } },
      { changeId: { in: changes.map(c => c.id) } }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    select: { id: true, action: true, outcome: true, actorName: true, actorKind: true, createdAt: true } })
  const records = await tx.businessRecord.findMany({ where: { workspaceId: run.workspaceId,
    id: { in: changes.map(c => c.recordId) } }, select: { id: true, capability: true } })
  return { ...run, stalled: run.status === 'queued' && Date.now() - run.updatedAt.getTime() >= agentLimits.stalledMs, deadlineAt: new Date(run.createdAt.getTime() + agentLimits.runLifetimeMs), recovery: runRecovery(run.status, run.error), history,
    inspection: agentRunSchema.shape.steps.parse(run.steps).map((step, index) => {
      const change = changes.find(c => c.id === receipts[index]?.changeId)
      const status = change?.status === 'applied' ? 'applied'
        : run.status === 'cancelled' ? 'cancelled'
        : change?.status === 'rejected' ? 'rejected'
        : run.status === 'failed' && index === run.nextStep ? 'failed'
        : change?.status === 'pending' ? 'waiting' : 'not started'
      const record = records.find(r => r.id === change?.recordId && r.capability === step.capability)
      return { index, ...step, status, recordId: record?.id ?? null,
        proposal: change ? { id: change.id, status: change.status, input: change.input,
          before: change.before, after: change.after, checks: change.checks,
          executionMode: change.executionMode, reviewedBy: change.reviewedBy, reviewedAt: change.reviewedAt } : null }
    }) }
}
export type InspectedRun = Awaited<ReturnType<typeof inspectRun>>
