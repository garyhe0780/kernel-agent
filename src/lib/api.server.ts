import { BuildJobs, startBuildWorker } from '../kernel/build-jobs.server'
import { buildJobResponse } from './build-job-stream.server'
import { progressResponse } from './progress-stream.server'
import type { BuildProgress } from './progress-stream'
import { planningContentSchema } from '../kernel/builder-plan'
import { z } from 'zod'
import { AgentAccess, agentGrantSchema } from '../kernel/agent-access.server'
import { handleAgentCredential } from './agent-api.server'
import { auth } from './auth.server'
import { db } from './db.server'
import { Kernel, KernelError } from '../kernel/engine.server'
import { purchasingExample } from '../kernel/application'
import { clarifyApplication, modelStatus, modelSettings, testModelConnection, planOperation, planApplication } from '../kernel/model.server'
import type { Principal } from '../kernel/definition'

const kernel = new Kernel(db)
const buildJobs = new BuildJobs(db)
const workers = globalThis as unknown as { stopKernelBuildWorker?: () => void }
// Replace the dev hot-reload loop; leases fence any old in-flight task.
workers.stopKernelBuildWorker?.()
workers.stopKernelBuildWorker = startBuildWorker(buildJobs)
const agentAccess = new AgentAccess(db)
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('retry_build'), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal('invite_member'), email: z.string().email().max(254), role: z.enum(['owner', 'operator']) }).strict(),
  z.object({ type: z.literal('revoke_invitation'), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal('preview_invitation'), token: z.string().min(32).max(200) }).strict(),
  z.object({ type: z.literal('accept_invitation'), token: z.string().min(32).max(200) }).strict(),
  z.object({ type: z.literal('update_member'), userId: z.string().min(1), expectedRole: z.enum(['owner', 'operator']), role: z.enum(['owner', 'operator', 'remove']) }).strict(),
  z.object({ type: z.literal('test_model_connection') }).strict(),
  z.object({ type: z.literal('create_workspace'), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ type: z.literal('rename_workspace'), name: z.string().trim().min(1).max(80), expectedName: z.string() }).strict(),
  z.object({ type: z.literal('save_plan'), id: z.string().optional(), expectedVersion: z.number().int().positive().optional(), draftId: z.string().optional(), content: planningContentSchema }).strict(),
  z.object({ type: z.literal('plan_step'), id: z.string(), expectedVersion: z.number().int().positive(), step: z.enum(['propose', 'confirm', 'build', 'recover']) }).strict(),
  agentGrantSchema.extend({ type: z.literal('create_agent_credential') }),
  z.object({ type: z.literal('revoke_agent_credential'), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal('clarify'), brief: z.string().trim().min(10).max(4000), id: z.string().optional(), expectedVersion: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal('build'), brief: z.string().trim().min(10).max(4000), id: z.string().optional(), expectedVersion: z.number().int().positive().optional() }).strict(),
  z.object({ type: z.literal('edit_project'), project: z.string().min(1) }).strict(),
  z.object({ type: z.literal('preview_migration'), id: z.string(), expectedVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('example') }).strict(),
  z.object({ type: z.literal('save_draft'), id: z.string(), expectedVersion: z.number().int().positive(), brief: z.string().max(4000), definition: z.unknown() }).strict(),
  z.object({ type: z.literal('publish_draft'), id: z.string(), expectedVersion: z.number().int().positive(), previewToken: z.string().optional() }).strict(),
  z.object({ type: z.literal('operate'), project: z.string().min(1), instruction: z.string().trim().min(5).max(2000), idempotencyKey: z.string().min(8).max(100) }).strict(),
  z.object({ type: z.literal('create'), capability: z.string().min(1).optional(), data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('stage'), recordId: z.string().min(1), action: z.string().min(1), input: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().min(8).max(100) }).strict(),
  z.object({ type: z.literal('review'), changeId: z.string().min(1), decision: z.enum(['apply', 'reject']) }).strict(),
  z.object({ type: z.literal('policies'), expectedVersion: z.number().int().positive(), approvalLimitCents: z.number().int().min(1).max(100000000), requireVerifiedSupplier: z.boolean() }).strict(),
])

async function principal(request: Request, kind: Principal['kind']) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new KernelError('UNAUTHENTICATED', 'Sign in to your workspace.', 401)
  const member = await kernel.workspaceMembership(session.user, request.headers.get('x-kernel-workspace') || undefined)
  return { userId: session.user.id, name: session.user.name, workspaceId: member.workspaceId, role: member.role, kind } satisfies Principal
}

function checkOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const allowed = new Set([process.env.BETTER_AUTH_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://127.0.0.1:3000'])
  if (!origin || !allowed.has(origin)) throw new KernelError('INVALID_ORIGIN', 'This write must originate from your local workspace.', 403)
}

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleKernel(request: Request, agent = false) {
  try {
    if (request.headers.has('authorization')) {
      if (agent) return handleAgentCredential(request, agentAccess, kernel)
      throw new KernelError('FORBIDDEN', 'Agent credentials are accepted only at /api/agent.', 403)
    }
    if (request.method === 'POST') checkOrigin(request)
    const p = await principal(request, agent ? 'agent' : 'human')
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams
      if (!agent && query.has('buildJob')) {
        const id = query.get('buildJob')!
        const job = await buildJobs.get(p, id)
        if (request.headers.get('accept')?.includes('text/event-stream')) return buildJobResponse(() => buildJobs.get(p, id), job, Number(query.get('after')) || 0)
        return response(job)
      }
      if (!agent && query.has('buildForPlan')) return response(await buildJobs.forPlan(p, query.get('buildForPlan')!))
      if (!agent && new URL(request.url).searchParams.has('workspaces')) return response(await kernel.listWorkspaces(p))
      if (!agent && new URL(request.url).searchParams.has('settings')) return response({ ...await kernel.workspaceSettings(p), model: modelSettings() })
      if (!agent && new URL(request.url).searchParams.has('workspaceAgents')) return response(await agentAccess.listWorkspace(p))
      if (!agent && new URL(request.url).searchParams.has('activity')) return response(await kernel.activity(p, new URL(request.url).searchParams.get('cursor') || undefined))
      if (!agent && new URL(request.url).searchParams.has('inbox')) return response(await kernel.inbox(p))
      if (!agent && new URL(request.url).searchParams.has('agents')) return response(await agentAccess.list(p, new URL(request.url).searchParams.get('agents')!))
      if (!agent && new URL(request.url).searchParams.has('plans')) return response(await kernel.listPlans(p))
      if (!agent && new URL(request.url).searchParams.has('drafts')) return response({ drafts: await kernel.listDrafts(p), model: modelStatus() })
      if (!agent && new URL(request.url).searchParams.has('history')) return response(await kernel.projectHistory(p, new URL(request.url).searchParams.get('history')!))
      const project = new URL(request.url).searchParams.get('project') ?? undefined
      const state = await kernel.snapshot(p, project)
      return response(agent ? { tools: state.tools, records: state.records, capabilities: state.capabilities.map(cap => ({ slug: cap.slug, version: cap.version })), project: state.project?.slug, mode: 'Authenticated tools; proposals require human review.' } : { ...state, model: { configured: modelStatus().configured } })
    }
    const text = await request.text()
    if (text.length > 128000) throw new KernelError('TOO_LARGE', 'Request exceeds the size limit.', 413)
    const command = commandSchema.parse(JSON.parse(text))
    if (agent && command.type !== 'stage') throw new KernelError('FORBIDDEN', 'The agent endpoint can only stage proposals.', 403)
    switch (command.type) {
      case 'retry_build': return response(await buildJobs.retry(p, command.id), 202)
      case 'invite_member': return response(await kernel.inviteMember(p, command.email, command.role))
      case 'revoke_invitation': return response(await kernel.revokeInvitation(p, command.id))
      case 'preview_invitation': return response(await kernel.previewInvitation(p, command.token))
      case 'accept_invitation': return response(await kernel.acceptInvitation(p, command.token))
      case 'update_member': return response(await kernel.updateMember(p, command.userId, command.expectedRole, command.role))
      case 'test_model_connection': { await kernel.workspaceSettings(p); return response(await testModelConnection()) }
      case 'create_workspace': return response(await kernel.createWorkspace(p, command.name))
      case 'rename_workspace': return response(await kernel.renameWorkspace(p, command.name, command.expectedName))
      case 'save_plan': return response(await kernel.savePlan(p, command))
      case 'plan_step': {
        if (command.step === 'build') return response(await buildJobs.start(p, command.id, command.expectedVersion), 202)
        const plan = await kernel.planState(p, command.id, command.expectedVersion)
        if (command.step === 'confirm') return response(await kernel.planState(p, plan.id, plan.version, 'confirmed'))
        if (command.step === 'recover') return response(await kernel.planState(p, plan.id, plan.version, 'planning'))
        const current = plan.draftId ? await kernel.getDraft(p, plan.draftId) : undefined
        const work = async (report: (progress: BuildProgress) => void) => {
          if (command.step === 'propose') {
            report({ stage: 'planning', message: 'Shaping your records, workflow and approval rules.' })
            const proposal = await planApplication(plan.content, current?.definition)
            report({ stage: 'saving', message: 'Saving your plan and open decisions.' })
            return kernel.planState(p, plan.id, plan.version, 'planning', { ...plan.content, needsProposal: false, answers: {}, proposal, messages: [...plan.content.messages, { role: 'assistant', text: proposal.plan.summary }] })
          }
        }
        if (request.headers.get('accept')?.includes('text/event-stream')) return progressResponse(work, error => error instanceof KernelError ? error.message : 'Unable to finish this request. Your plan is saved; reopen it to check status.')
        return response(await work(() => {}))
      }
      case 'create_agent_credential': { const { type: _type, ...grant } = command; return response(await agentAccess.create(p, grant)) }
      case 'revoke_agent_credential': return response(await agentAccess.revoke(p, command.id))
      case 'edit_project': return response({ draft: await kernel.editProject(p, command.project), model: modelStatus() })
      case 'preview_migration': return response(await kernel.previewMigration(p, command.id, command.expectedVersion))
      case 'example': return response(await kernel.saveDraft(p, { brief: 'Track suppliers and purchase requests with owner review.', definition: purchasingExample(), source: 'example' }))
      case 'save_draft': return response(await kernel.saveDraft(p, { ...command, source: 'manual' }))
      case 'publish_draft': return response(await kernel.publishDraft(p, command.id, command.expectedVersion, command.previewToken))
      case 'clarify':
      case 'build': {
        await kernel.listDrafts(p)
        const current = command.id ? await kernel.getDraft(p, command.id) : undefined
        if (current && (current.status !== 'draft' || current.version !== command.expectedVersion)) throw new KernelError('STALE_DRAFT', 'Reopen the current draft before revising it.', 409)
        if (command.type === 'clarify') return response(await clarifyApplication(command.brief, current?.definition))
        throw new KernelError('PLAN_REQUIRED', 'Open the application planner and confirm a plan before building.', 409)
      }
      case 'operate': {
        const state = await kernel.snapshot(p, command.project)
        const result = await planOperation({ instruction: command.instruction, records: state.records.slice(0, 100), capabilities: state.capabilities.map(c => c.definition), pending: state.changes.filter(c => c.status === 'pending').map(c => c.recordId) })
        if (!result.recordId || !result.action) return response({ explanation: result.explanation, status: 'no_action' })
        if (!state.records.some(r => r.id === result.recordId)) throw new KernelError('FORBIDDEN', 'The agent selected a record outside this project.', 403)
        const staged = await kernel.stage({ ...p, kind: 'agent' }, { recordId: result.recordId, action: result.action, input: result.input, idempotencyKey: command.idempotencyKey })
        return response({ ...staged, explanation: result.explanation })
      }
      case 'create': return response(await kernel.createRecord(p, command.data, command.capability ?? 'procurement'))
      case 'stage': return response(await kernel.stage(p, command))
      case 'review': return response(await kernel.review(p, command.changeId, command.decision))
      case 'policies': return response(await kernel.updatePolicies(p, command.expectedVersion, { approvalLimitCents: command.approvalLimitCents, requireVerifiedSupplier: command.requireVerifiedSupplier }))
    }
  } catch (error) {
    if (error instanceof KernelError) return response({ error: error.message, code: error.code }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: 'Invalid input. Check the required fields.', code: 'INVALID_INPUT' }, 400)
    if (error instanceof Error && !error.name.startsWith('Prisma') && !('code' in error)) return response({ error: error.message, code: 'INVALID_INPUT' }, 400)
    console.error('Kernel request failed', error instanceof Error ? error.name : 'Unknown error')
    return response({ error: 'The operation could not complete. Refresh and try again.', code: 'INTERNAL_ERROR' }, 500)
  }
}

export async function handlePublic(workspaceId: string) {
  try {
    return response(await kernel.publicSite(workspaceId))
  } catch (error) {
    if (error instanceof KernelError) return response({ error: error.message, code: error.code }, error.status)
    console.error('Public site failed', error instanceof Error ? error.name : 'Unknown error')
    return response({ error: 'The public site could not be opened.', code: 'INTERNAL_ERROR' }, 500)
  }
}
