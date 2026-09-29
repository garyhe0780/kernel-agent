import { hasOwnerAccess } from './member-access.server'
import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient, type BuildJob } from '@prisma/client'
import { Kernel } from './engine.server'
import { KernelError } from './errors'
import type { Principal } from './definition'
import { planningContentSchema, planBrief } from './builder-plan'
import { validateApplication } from './application'
import { nextBuildTask, executeBuildTask, type BuildInput, type Checkpoints } from './build-pipeline.server'
import type { BuildJobEvent, BuildJobSnapshot } from './build-job'
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const eventsOf = (job: BuildJob) => job.events as unknown as BuildJobEvent[]
const event = (events: BuildJobEvent[], task: string, message: string, details?: unknown) => [...events, { id: events.length + 1, task, message, at: new Date().toISOString(), ...(details ? { details } : {}) }]
export function jobSnapshot(job: BuildJob): BuildJobSnapshot {
  return { id: job.id, planId: job.planId, planVersion: job.planVersion, status: job.status as BuildJobSnapshot['status'], task: job.task, revision: job.revision, completedTasks: Object.keys(job.checkpoints as object), events: eventsOf(job), error: job.error as BuildJobSnapshot['error'], draftId: job.draftId }
}
async function owner(tx: Prisma.TransactionClient, p: Principal) {
  if (p.kind !== 'human' || p.agentCredentialId || p.role !== 'owner' || !(await hasOwnerAccess(tx, p.workspaceId, p.userId))) throw new KernelError('FORBIDDEN', 'Only workspace owners can access builds.', 403)
}

export class BuildJobs {
  constructor(private db: PrismaClient, private execute = executeBuildTask, private leaseMs = 60000) {}

  async start(p: Principal, planId: string, version: number) {
    return this.db.$transaction(async tx => {
      await owner(tx, p)
      const plan = await tx.builderPlan.findFirst({ where: { id: planId, workspaceId: p.workspaceId } })
      if (!plan) throw new KernelError('NOT_FOUND', 'Plan not found.', 404)
      // A lost enqueue response can be retried with the original confirmed version.
      const existing = await tx.buildJob.findFirst({ where: { planId, workspaceId: p.workspaceId, planVersion: version + 1 } })
      if (existing && ((plan.version === existing.planVersion && plan.status === 'building') || (existing.status === 'completed' && plan.status === 'generated' && plan.version === existing.planVersion + 1))) return jobSnapshot(existing)
      if (plan.version !== version || plan.status !== 'confirmed') throw new KernelError('PLAN_NOT_CONFIRMED', 'Review and confirm the current plan before building.', 409)
      const content = planningContentSchema.parse(plan.content)
      if (!content.proposal || content.needsProposal || content.proposal.questions.length) throw new KernelError('PLAN_INCOMPLETE', 'Resolve the current plan before building.', 409)
      const draft = plan.draftId ? await tx.projectDraft.findFirst({ where: { id: plan.draftId, workspaceId: p.workspaceId, version: plan.draftVersion ?? -1, status: 'draft' } }) : null
      if (plan.draftId && !draft) throw new KernelError('STALE_DRAFT', 'The preview changed. Reopen the plan before building.', 409)
      await tx.builderPlan.update({ where: { id: planId }, data: { status: 'building', version: { increment: 1 } } })
      const input: BuildInput = { brief: planBrief(content.proposal.plan), ...(draft ? { current: validateApplication(draft.definition), currentAssembly: draft.assembly == null ? undefined : draft.assembly as BuildInput['currentAssembly'] } : {}) }
      return jobSnapshot(await tx.buildJob.create({ data: { workspaceId: p.workspaceId, planId, planVersion: version + 1, createdBy: p.userId, input: json(input), checkpoints: {}, events: json(event([], 'assembly', 'Build queued. You can leave this page; completed work will be saved.')) } }))
    })
  }

  async get(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      await owner(tx, p)
      const job = await tx.buildJob.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!job) throw new KernelError('NOT_FOUND', 'Build not found.', 404)
      return jobSnapshot(job)
    })
  }

  async forPlan(p: Principal, planId: string) {
    return this.db.$transaction(async tx => {
      await owner(tx, p)
      const plan = await tx.builderPlan.findFirst({ where: { id: planId, workspaceId: p.workspaceId } })
      if (!plan) throw new KernelError('NOT_FOUND', 'Plan not found.', 404)
      const job = await tx.buildJob.findFirst({ where: { planId, workspaceId: p.workspaceId, planVersion: plan.status === 'generated' ? plan.version - 1 : plan.version }, orderBy: { createdAt: 'desc' } })
      return job ? jobSnapshot(job) : null
    })
  }

  async retry(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      await owner(tx, p)
      const job = await tx.buildJob.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!job) throw new KernelError('NOT_FOUND', 'Build not found.', 404)
      if (!await tx.builderPlan.findFirst({ where: { id: job.planId, workspaceId: p.workspaceId, version: job.planVersion, status: 'building' } })) throw new KernelError('STALE_PLAN', 'The plan changed. Confirm its current version to start a new build.', 409)
      if (job.status === 'queued' || job.status === 'running') return jobSnapshot(job)
      if (job.status !== 'failed') throw new KernelError('BUILD_NOT_RETRYABLE', 'This build cannot be retried.', 409)
      return jobSnapshot(await tx.buildJob.update({ where: { id }, data: { status: 'queued', error: Prisma.DbNull, leaseToken: null, leaseUntil: null, revision: { increment: 1 }, events: json(event(eventsOf(job), job.task, 'Retry queued. Completed tasks will be reused.')) } }))
    })
  }

  /** One durable task per lease. Multiple processes may poll the same database. */
  async runOne(jobId?: string) {
    const now = new Date(), token = randomUUID()
    const candidate = jobId
      ? await this.db.buildJob.findFirst({ where: { id: jobId, OR: [{ status: 'queued' }, { status: 'running', leaseUntil: { lt: now } }] } })
      : await this.db.buildJob.findFirst({ where: { OR: [{ status: 'queued' }, { status: 'running', leaseUntil: { lt: now } }] }, orderBy: { updatedAt: 'asc' } })
    if (!candidate) return false
    const claimed = await this.db.buildJob.updateMany({ where: { id: candidate.id, revision: candidate.revision, OR: [{ status: 'queued' }, { status: 'running', leaseUntil: { lt: now } }] }, data: { status: 'running', leaseToken: token, leaseUntil: new Date(Date.now() + this.leaseMs), revision: { increment: 1 } } })
    if (!claimed.count) return true
    const job = await this.db.buildJob.findUniqueOrThrow({ where: { id: candidate.id } })
    let renewing = false
    const heartbeat = setInterval(() => {
      if (renewing) return
      renewing = true
      void this.db.buildJob.updateMany({ where: { id: job.id, leaseToken: token, status: 'running', leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + this.leaseMs) } }).catch(() => {}).finally(() => { renewing = false })
    }, Math.max(10, this.leaseMs / 3))
    heartbeat.unref?.()
    try {
      const user = await this.db.user.findUnique({ where: { id: job.createdBy } })
      const p: Principal = { userId: job.createdBy, workspaceId: job.workspaceId, role: 'owner', kind: 'human', name: user?.name ?? 'Build owner' }
      await this.db.$transaction(async tx => {
        await owner(tx, p)
        if (!await tx.builderPlan.findFirst({ where: { id: job.planId, workspaceId: job.workspaceId, version: job.planVersion, status: 'building' } })) throw new KernelError('STALE_PLAN', 'This build was superseded by a changed plan.', 409)
      })
      const checkpoints = job.checkpoints as Checkpoints
      const task = nextBuildTask(checkpoints)
      const events = event(eventsOf(job), task.key, task.message)
      const started = await this.db.buildJob.updateMany({ where: { id: job.id, leaseToken: token, status: 'running', leaseUntil: { gt: new Date() } }, data: { task: task.key, events: json(events), revision: { increment: 1 } } })
      if (!started.count) return true
      const output = await this.execute(job.input as unknown as BuildInput, checkpoints)
      if (task.key === 'assemble') {
        await new Kernel(this.db).finishPlan(p, job.planId, job.planVersion, output, { id: job.id, token })
      } else {
        await this.db.$transaction(async tx => {
          await owner(tx, p)
          if (!await tx.builderPlan.findFirst({ where: { id: job.planId, version: job.planVersion, status: 'building' } })) throw new KernelError('STALE_PLAN', 'This build was superseded by a changed plan.', 409)
          const next = { ...checkpoints, [task.key]: output }
          await tx.buildJob.updateMany({ where: { id: job.id, leaseToken: token, status: 'running', leaseUntil: { gt: new Date() } }, data: { checkpoints: json(next), status: 'queued', task: nextBuildTask(next).key, leaseToken: null, leaseUntil: null, revision: { increment: 1 }, events: json(event(events, task.key, `Saved: ${task.message}`)) } })
        })
      }
    } catch (error) {
      const failure = error instanceof KernelError ? { code: error.code, message: error.message, details: error.details } : { code: 'BUILD_TASK_FAILED', message: 'This build task could not finish. Completed tasks are saved.' }
      const latest = await this.db.buildJob.findUnique({ where: { id: job.id } })
      if (latest) await this.db.buildJob.updateMany({ where: { id: job.id, leaseToken: token, status: 'running', leaseUntil: { gt: new Date() } }, data: { status: ['STALE_PLAN', 'STALE_DRAFT', 'FORBIDDEN'].includes(failure.code) ? 'superseded' : 'failed', error: json(failure), leaseToken: null, leaseUntil: null, revision: { increment: 1 }, events: json(event(eventsOf(latest), latest.task, failure.message, failure)) } })
    } finally { clearInterval(heartbeat) }
    return true
  }
}

/** Embedded worker for a long-lived local server. Dedicated worker entrypoint also
 * polls this queue, so restarts can recover without requiring browser traffic. */
export function startBuildWorker(jobs: BuildJobs) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    try { await jobs.runOne() } catch (error) { console.error('Build worker polling failed:', error instanceof Error ? error.name : 'Unknown error') }
    if (!stopped) { timer = setTimeout(tick, 1000); timer.unref?.() }
  }
  void tick()
  return () => { stopped = true; clearTimeout(timer) }
}
