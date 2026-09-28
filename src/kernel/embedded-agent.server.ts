import { agentLimits, lockCredential } from './agent-limits.server'
import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { AgentAccess } from './agent-access.server'
import { Kernel } from './engine.server'
import { KernelError } from './errors'
import type { Principal } from './definition'
import { canonical } from './migration'
import { embeddedOperationSchema, operationPlanSchema } from './embedded-agent'
import { planScopedOperation } from './model.server'

/** Provider calls occur outside transactions. Only a fenced, persisted plan can
 * reach the same scoped run executor used by external agents. */
export class EmbeddedAgent {
  constructor(private db: PrismaClient, private kernel: Kernel, private access: AgentAccess,
    private plan: (context: unknown, signal?: AbortSignal) => Promise<unknown> = (context, signal) => planScopedOperation(context, (url, init) => fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) : init?.signal }))) {}

  async recent(owner: Principal, project: string) {
    const grants = await this.access.list(owner, project)
    const runs = await this.db.agentRun.findMany({ where: { workspaceId: owner.workspaceId, agentCredentialId: { in: grants.map(g => g.id) } }, orderBy: { createdAt: 'desc' }, take: 10 })
    return Promise.all(runs.map(run => this.kernel.agentRun(owner, { runId: run.id })))
  }

  async operate(owner: Principal, raw: unknown) {
    const command = embeddedOperationSchema.parse(raw)
    let p = await this.access.forEmbedded(owner, command.project, command.credentialId)
    const identity = { workspaceId: owner.workspaceId, userId: owner.userId, idempotencyKey: command.idempotencyKey }
    const load = () => this.db.embeddedOperation.upsert({ where: { workspaceId_userId_idempotencyKey: identity }, update: {}, create: { ...identity, request: command } })
    let request
    try { request = await load() } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      request = await load()
    }
    if (canonical(request.request) !== canonical(command)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key was used for a different assistant request.', 409)
    let saved = request.plan
    if (saved === null) {
      const token = randomUUID()
      const deadline = Date.now() + agentLimits.planningMs
      const until = () => new Date(deadline)
      const claim = await this.db.$transaction(async tx => {
        await lockCredential(tx, command.credentialId)
        const active = await tx.embeddedOperation.count({ where: { workspaceId: owner.workspaceId, request: { path: ['credentialId'], equals: command.credentialId }, leaseUntil: { gt: new Date() }, leaseToken: { not: null } } })
        if (active) throw new KernelError('OPERATION_BUSY', 'A task is already being planned with this credential. Wait for it to finish.', 409)
        return tx.embeddedOperation.updateMany({ where: { id: request.id, plan: { equals: Prisma.DbNull }, OR: [{ leaseToken: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: until() } })
      })
      if (!claim.count) throw new KernelError('OPERATION_BUSY', 'This task is already being planned. Retry the same request shortly.', 409)
      try {
        const snapshot = await this.kernel.agentSnapshot(p)
        const observed = new Set(snapshot.records.map(r => r.id))
        const queryResults: unknown[] = []
        for (let round = 0; round < 3; round++) {
          p = await this.access.forEmbedded(owner, command.project, command.credentialId)
          const heartbeat = await this.db.embeddedOperation.updateMany({ where: { id: request.id, leaseToken: token, leaseUntil: { gt: new Date() } }, data: { leaseUntil: until() } })
          if (!heartbeat.count) throw new KernelError('OPERATION_BUSY', 'Planning lease expired. Retry the same request.', 409)
          const context = { instruction: command.instruction, allowAutomatic: command.allowAutomatic, snapshot, queryResults, queryRoundsRemaining: 2 - round }
          if (new TextEncoder().encode(JSON.stringify(context)).byteLength > agentLimits.modelInputBytes) throw new KernelError('MODEL_INPUT_LIMIT', 'The planning context exceeds 200 KB. Narrow this credential’s scope or use targeted external tools.', 422)
          await this.db.$transaction(async tx => {
            await lockCredential(tx, command.credentialId)
            const current = await tx.embeddedOperation.findFirst({ where: { id: request.id, leaseToken: token, leaseUntil: { gt: new Date() } } })
            if (!current) throw new KernelError('OPERATION_BUSY', 'Planning lease expired. Retry the same request.', 409)
            const taskCalls = await tx.agentModelCall.count({ where: { requestId: request.id } })
            if (taskCalls >= agentLimits.modelCallsPerTask) throw new KernelError('MODEL_TASK_LIMIT', 'This task used its three model calls. Start a smaller new task.', 429)
            const hourCalls = await tx.agentModelCall.count({ where: { credentialId: command.credentialId, createdAt: { gt: new Date(Date.now() - 3_600_000) } } })
            if (hourCalls >= agentLimits.modelCallsPerHour) throw new KernelError('MODEL_RATE_LIMIT', 'This credential used 30 model calls in the last hour. Retry later.', 429)
            await tx.agentModelCall.create({ data: { credentialId: command.credentialId, requestId: request.id } })
          })
          const controller = new AbortController()
          let timer: ReturnType<typeof setTimeout> | undefined
          const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new KernelError('PLANNING_TIMEOUT', 'Planning exceeded five minutes. Retry the same task; model calls already attempted still count.', 504)) }, Math.max(0, deadline - Date.now())) })
          let output: unknown
          try { output = await Promise.race([this.plan(context, controller.signal), timeout]) } finally { clearTimeout(timer) }
          const plan = operationPlanSchema.parse(output)
          if (plan.queries.length) {
            if (round === 2) throw new KernelError('QUERY_LIMIT', 'The assistant needs more information. Narrow the task and try again.', 422)
            for (const query of plan.queries) {
              // Revalidate both session owner and credential after each provider call.
              p = await this.access.forEmbedded(owner, command.project, command.credentialId)
              const result = await this.kernel.queryRecords(p, query)
              result.records.forEach(record => observed.add(record.id))
              queryResults.push({ query, result })
            }
            continue
          }
          for (const step of plan.steps) {
            if (step.execution === 'automatic' && !command.allowAutomatic) throw new KernelError('AGENT_SCOPE', 'This assistant request requires human review.', 403)
            if (step.operation === 'action' && typeof step.record === 'string' && !observed.has(step.record)) throw new KernelError('INVALID_MODEL_OUTPUT', 'The assistant selected an unobserved record. Ask it to find the record first.', 422)
          }
          const checkpoint = await this.db.embeddedOperation.updateMany({ where: { id: request.id, leaseToken: token, leaseUntil: { gt: new Date() } }, data: { plan: plan as Prisma.InputJsonValue, leaseToken: null, leaseUntil: null } })
          if (!checkpoint.count) throw new KernelError('OPERATION_BUSY', 'Planning lease expired. Retry the same request.', 409)
          saved = plan as Prisma.JsonObject
          break
        }
      } finally {
        await this.db.embeddedOperation.updateMany({ where: { id: request.id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } })
      }
    }
    const plan = operationPlanSchema.parse(saved)
    p = await this.access.forEmbedded(owner, command.project, command.credentialId)
    if (!plan.steps.length) return { status: 'no_action' as const, explanation: plan.explanation, run: null }
    const run = await this.kernel.startAgentRun(p, { idempotencyKey: `embedded:${request.id}`, steps: plan.steps })
    return { status: run.status, explanation: plan.explanation, run }
  }
}
