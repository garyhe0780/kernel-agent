import { accessInclude, effectiveRole, hasOwnerAccess } from './member-access.server'
import { createHash, randomBytes } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { definitionSchema, type Principal } from './definition'
import { KernelError } from './errors'
import { CREATE_ACTION } from './record-operations'

type Tx = Prisma.TransactionClient
export const agentActionSchema = z.object({ capability: z.string().min(1), action: z.string().min(1), version: z.number().int().positive(), execution: z.enum(['review', 'automatic']).optional() }).strict()
export const agentGrantSchema = z.object({ project: z.string().min(1), name: z.string().trim().min(1).max(80), expiresInDays: z.number().int().min(1).max(90), actions: z.array(agentActionSchema).min(1).max(100) }).strict()
export const agentCredentialCommandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(90),
  kind: z.enum(['operate', 'construct']).optional(),
  project: z.string().min(1).optional(),
  actions: z.array(agentActionSchema).max(100).optional(),
}).strict()
export type AgentAction = z.infer<typeof agentActionSchema>
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const publicCredential = ({ tokenHash: _hash, ...credential }: Awaited<ReturnType<Tx['agentCredential']['findUniqueOrThrow']>>) => credential
const grantKind = (grant: { kind?: string | null }) => grant.kind === 'construct' ? 'construct' as const : 'operate' as const

export async function resolveAgent(tx: Tx, id: string) {
  const grant = await tx.agentCredential.findUnique({ where: { id } })
  if (!grant || grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) throw new KernelError('INVALID_CREDENTIAL', 'Agent credential is expired or revoked. Ask the owner for a new credential.', 401)
  const member = await hasOwnerAccess(tx, grant.workspaceId, grant.createdBy)
  if (!member) throw new KernelError('INVALID_CREDENTIAL', 'The credential owner or application is no longer available.', 401)
  if (grantKind(grant) === 'construct') {
    const p: Principal = { userId: grant.createdBy, workspaceId: grant.workspaceId, name: grant.name, role: 'owner', kind: 'agent', agentCredentialId: grant.id, agentGrant: 'construct' }
    return { grant, project: null, p, actions: [] as AgentAction[] }
  }
  const project = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: grant.workspaceId, slug: grant.projectSlug! } } })
  if (!project) throw new KernelError('INVALID_CREDENTIAL', 'The credential owner or application is no longer available.', 401)
  const p: Principal = { userId: grant.createdBy, workspaceId: grant.workspaceId, name: grant.name, role: 'operator', kind: 'agent', agentCredentialId: grant.id, agentGrant: 'operate' }
  return { grant, project, p, actions: z.array(agentActionSchema).parse(grant.actions) }
}

export async function authorizeAgentAction(tx: Tx, id: string, capability: string, action: string, version: number) {
  const access = await resolveAgent(tx, id)
  if (!access.project || access.p.agentGrant !== 'operate') throw new KernelError('AGENT_SCOPE', 'This credential cannot stage record changes.', 403)
  const packages = z.array(z.string()).parse(access.project.packages)
  const scope = access.actions.find(a => a.capability === capability && a.action === action)
  if (!packages.includes(capability) || !scope) throw new KernelError('AGENT_SCOPE', 'This action is outside the credential scope.', 403)
  if (scope.version !== version) throw new KernelError('STALE_AGENT_SCOPE', 'The application definition changed. Ask the owner to review and issue a new credential.', 409)
  return { ...access, scope }
}

export class AgentAccess {
  constructor(private db: PrismaClient) {}
  private async workspaceOwner(tx: Tx, p: Principal) {
    const member = await hasOwnerAccess(tx, p.workspaceId, p.userId)
    if (p.kind !== 'human' || p.agentCredentialId || p.role !== 'owner' || !member) throw new KernelError('FORBIDDEN', 'Only a workspace owner can manage agent access.', 403)
    return member
  }
  private async owner(tx: Tx, p: Principal, project: string) {
    await this.workspaceOwner(tx, p)
    const row = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: project } } })
    if (!row) throw new KernelError('NOT_FOUND', 'Application not found.', 404)
    return row
  }
  /** Owner session selects a grant by ID; no bearer secret is disclosed or needed. */
  async forEmbedded(p: Principal, project: string, credentialId: string) {
    return this.db.$transaction(async tx => {
      await this.owner(tx, p, project)
      const grant = await tx.agentCredential.findFirst({ where: { id: credentialId, workspaceId: p.workspaceId, projectSlug: project, kind: 'operate' } })
      if (!grant) throw new KernelError('NOT_FOUND', 'Application credential not found.', 404)
      return (await resolveAgent(tx, grant.id)).p
    })
  }
  async listWorkspace(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.workspaceOwner(tx, p)
      const [grants, caps, projects, owners] = await Promise.all([
        tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' } }),
        tx.capability.findMany({ where: { workspaceId: p.workspaceId }, select: { slug: true, version: true } }),
        tx.project.findMany({ where: { workspaceId: p.workspaceId }, select: { slug: true, name: true } }),
        tx.membership.findMany({ where: { workspaceId: p.workspaceId }, include: accessInclude }),
      ])
      return grants.map(grant => {
        const kind = grantKind(grant)
        const actions = kind === 'operate' ? z.array(agentActionSchema).parse(grant.actions) : []
        const project = projects.find(item => item.slug === grant.projectSlug)
        const ownerOk = owners.some(owner => owner.userId === grant.createdBy && effectiveRole(owner) === 'owner')
        const stale = kind === 'operate' && (!project || actions.some(scope => caps.find(cap => cap.slug === scope.capability)?.version !== scope.version))
        const state = grant.revokedAt ? 'Revoked' : grant.expiresAt.getTime() <= Date.now() ? 'Expired' : !ownerOk || stale ? 'Needs review' : 'Active'
        return {
          id: grant.id, name: grant.name, kind, expiresAt: grant.expiresAt, actionCount: actions.length, state,
          projectSlug: project?.slug ?? null,
          projectName: kind === 'construct' ? 'Create applications' : project?.name ?? 'Unavailable application',
        }
      })
    })
  }
  async list(p: Principal, project: string) {
    return this.db.$transaction(async tx => {
      await this.owner(tx, p, project)
      return (await tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId, projectSlug: project, kind: 'operate' }, orderBy: { createdAt: 'desc' } })).map(publicCredential)
    })
  }
  async create(p: Principal, raw: unknown) {
    const input = agentCredentialCommandSchema.parse(raw)
    const kind = input.kind ?? (input.project ? 'operate' : undefined)
    if (kind === 'construct') {
      if (input.project || input.actions?.length) throw new KernelError('INVALID_INPUT', 'Builder credentials are workspace-wide; they do not select an application or actions.')
      return this.db.$transaction(async tx => {
        await this.workspaceOwner(tx, p)
        const token = `krn_${randomBytes(32).toString('base64url')}`
        const credential = await tx.agentCredential.create({ data: { workspaceId: p.workspaceId, kind: 'construct', name: input.name, createdBy: p.userId, actions: [], tokenHash: digest(token), prefix: token.slice(0, 12), expiresAt: new Date(Date.now() + input.expiresInDays * 86400000) } })
        await tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action: 'agent.credential.create', outcome: 'applied', details: { kind: 'construct', credentialId: credential.id, name: credential.name } } })
        return { credential: publicCredential(credential), token }
      })
    }
    const command = agentGrantSchema.parse({ name: input.name, expiresInDays: input.expiresInDays, project: input.project, actions: input.actions })
    return this.db.$transaction(async tx => {
      const project = await this.owner(tx, p, command.project)
      const packages = z.array(z.string()).parse(project.packages)
      if (new Set(command.actions.map(scope => `${scope.capability}:${scope.action}`)).size !== command.actions.length) throw new KernelError('INVALID_INPUT', 'Choose each operation once; duplicate execution policies are ambiguous.')
      for (const scope of command.actions) {
        if (scope.execution === 'automatic' && !project.definition) throw new KernelError('AGENT_SCOPE', 'Automatic execution requires an application published through the builder.', 403)
        if (!packages.includes(scope.capability)) throw new KernelError('AGENT_SCOPE', 'Choose an action in this application.', 403)
        const cap = await tx.capability.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: scope.capability } } })
        if (!cap || cap.version !== scope.version) throw new KernelError('STALE_AGENT_SCOPE', 'Refresh the application before granting access.', 409)
        if (scope.action === CREATE_ACTION) {
          if (!project.definition) throw new KernelError('AGENT_SCOPE', 'Creation proposals require an application published through the builder.', 403)
          continue
        }
        const action = definitionSchema.parse(cap.definition).actions.find(a => a.name === scope.action)
        if (!action?.roles.includes('operator')) throw new KernelError('AGENT_SCOPE', 'Agents can only propose actions available to operators.', 403)
      }
      const token = `krn_${randomBytes(32).toString('base64url')}`
      const credential = await tx.agentCredential.create({ data: { workspaceId: p.workspaceId, projectSlug: project.slug, kind: 'operate', name: command.name, createdBy: p.userId, actions: command.actions, tokenHash: digest(token), prefix: token.slice(0, 12), expiresAt: new Date(Date.now() + command.expiresInDays * 86400000) } })
      await tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action: 'agent.credential.create', outcome: 'applied', details: { projectSlug: project.slug, credentialId: credential.id, name: credential.name, actions: command.actions } } })
      return { credential: publicCredential(credential), token }
    })
  }
  async revoke(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      const grant = await tx.agentCredential.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!grant) throw new KernelError('NOT_FOUND', 'Credential not found.', 404)
      if (grantKind(grant) === 'construct') await this.workspaceOwner(tx, p)
      else await this.owner(tx, p, grant.projectSlug!)
      if (!grant.revokedAt) {
        await tx.agentCredential.update({ where: { id }, data: { revokedAt: new Date() } })
        await tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action: 'agent.credential.revoke', outcome: 'applied', details: { projectSlug: grant.projectSlug, kind: grantKind(grant), credentialId: id, name: grant.name } } })
      }
      return { status: 'revoked' }
    })
  }
  async authenticate(token: string) {
    if (!/^krn_[A-Za-z0-9_-]{43}$/.test(token)) throw new KernelError('INVALID_CREDENTIAL', 'A valid Bearer agent credential is required.', 401)
    return this.db.$transaction(async tx => {
      const grant = await tx.agentCredential.findUnique({ where: { tokenHash: digest(token) } })
      if (!grant) throw new KernelError('INVALID_CREDENTIAL', 'A valid Bearer agent credential is required.', 401)
      return (await resolveAgent(tx, grant.id)).p
    })
  }
}
