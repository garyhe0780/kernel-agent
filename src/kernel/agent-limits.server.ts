import type { Prisma } from '@prisma/client'
import { KernelError } from './errors'

export const agentLimits = Object.freeze({ activeRuns: 5, operationsPerMinute: 60, runLifetimeMs: 7 * 24 * 60 * 60 * 1000,
  modelCallsPerTask: 3, modelCallsPerHour: 30, planningMs: 5 * 60 * 1000, modelInputBytes: 200_000, stalledMs: 60_000 })

/** Serialize admission across processes without holding a lock during provider calls. */
export async function lockCredential(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "AgentCredential" WHERE "id" = ${id} FOR UPDATE`
}
export async function admitRun(tx: Prisma.TransactionClient, id: string) {
  await lockCredential(tx, id)
  const active = await tx.agentRun.count({ where: { agentCredentialId: id, status: { in: ['queued', 'waiting'] } } })
  if (active >= agentLimits.activeRuns) throw new KernelError('RUN_LIMIT', 'This credential has five active runs. Finish or cancel a run before starting or retrying another.', 429)
}
export async function admitOperation(tx: Prisma.TransactionClient, id: string) {
  await lockCredential(tx, id)
  const count = await tx.changeSet.count({ where: { agentCredentialId: id, createdAt: { gt: new Date(Date.now() - 60_000) } } })
  if (count >= agentLimits.operationsPerMinute) throw new KernelError('OPERATION_RATE_LIMIT', 'This credential reached 60 new operations per minute. Wait one minute and retry the same request.', 429)
}
