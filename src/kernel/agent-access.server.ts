import { createHash, randomBytes } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { definitionSchema, type Principal } from './definition'
import { KernelError } from './errors'

type Tx = Prisma.TransactionClient
export const agentActionSchema = z.object({ capability: z.string().min(1), action: z.string().min(1), version: z.number().int().positive() }).strict()
export const agentGrantSchema = z.object({ project: z.string().min(1), name: z.string().trim().min(1).max(80), expiresInDays: z.number().int().min(1).max(90), actions: z.array(agentActionSchema).min(1).max(100) }).strict()
export type AgentAction = z.infer<typeof agentActionSchema>
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const publicCredential = ({ tokenHash: _hash, ...credential }: Awaited<ReturnType<Tx['agentCredential']['findUniqueOrThrow']>>) => credential

export async function resolveAgent(tx: Tx, id: string) {
  const grant = await tx.agentCredential.findUnique({ where: { id } })
  if (!grant || grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) throw new KernelError('INVALID_CREDENTIAL', 'Agent credential is expired or revoked. Ask the owner for a new credential.', 401)
  const member = await tx.membership.findFirst({ where: { userId: grant.createdBy, workspaceId: grant.workspaceId, role: 'owner' } })
  const project = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: grant.workspaceId, slug: grant.projectSlug } } })
  if (!member || !project) throw new KernelError('INVALID_CREDENTIAL', 'The credential owner or application is no longer available.', 401)
  const p: Principal = { userId: grant.createdBy, workspaceId: grant.workspaceId, name: grant.name, role: 'operator', kind: 'agent', agentCredentialId: grant.id }
  return { grant, project, p, actions: z.array(agentActionSchema).parse(grant.actions) }
}

export async function authorizeAgentAction(tx: Tx, id: string, capability: string, action: string, version: number) {
  const access = await resolveAgent(tx, id)
  const packages = z.array(z.string()).parse(access.project.packages)
  const scope = access.actions.find(a => a.capability === capability && a.action === action)
  if (!packages.includes(capability) || !scope) throw new KernelError('AGENT_SCOPE', 'This action is outside the credential scope.', 403)
  if (scope.version !== version) throw new KernelError('STALE_AGENT_SCOPE', 'The application definition changed. Ask the owner to review and issue a new credential.', 409)
  return access
}

export class AgentAccess {
  constructor(private db: PrismaClient) {}
  private async owner(tx: Tx, p: Principal, project: string) {
    const member = await tx.membership.findFirst({ where: { userId: p.userId, workspaceId: p.workspaceId, role: 'owner' } })
    if (p.kind !== 'human' || p.agentCredentialId || p.role !== 'owner' || !member) throw new KernelError('FORBIDDEN', 'Only a workspace owner can manage agent access.', 403)
    const row = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: project } } })
    if (!row) throw new KernelError('NOT_FOUND', 'Application not found.', 404)
    return row
  }
  async listWorkspace(p: Principal) {
    return this.db.$transaction(async tx => {
      const member = await tx.membership.findFirst({ where: { userId: p.userId, workspaceId: p.workspaceId, role: 'owner' } })
      if (p.kind !== 'human' || p.agentCredentialId || p.role !== 'owner' || !member) throw new KernelError('FORBIDDEN', 'Only a workspace owner can manage agent access.', 403)
      const [grants, caps, projects, owners] = await Promise.all([
        tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' } }),
        tx.capability.findMany({ where: { workspaceId: p.workspaceId }, select: { slug: true, version: true } }),
        tx.project.findMany({ where: { workspaceId: p.workspaceId }, select: { slug: true, name: true } }),
        tx.membership.findMany({ where: { workspaceId: p.workspaceId, role: 'owner' }, select: { userId: true } }),
      ])
      return grants.map(grant => {
        const actions = z.array(agentActionSchema).parse(grant.actions)
        const project = projects.find(item => item.slug === grant.projectSlug)
        const state = grant.revokedAt ? 'Revoked' : grant.expiresAt.getTime() <= Date.now() ? 'Expired' : !project || !owners.some(owner => owner.userId === grant.createdBy) || actions.some(scope => caps.find(cap => cap.slug === scope.capability)?.version !== scope.version) ? 'Needs review' : 'Active'
        return { id: grant.id, name: grant.name, projectSlug: project?.slug ?? null, projectName: project?.name ?? 'Unavailable application', expiresAt: grant.expiresAt, actionCount: actions.length, state }
      })
    })
  }
  async list(p: Principal, project: string) {
    return this.db.$transaction(async tx => {
      await this.owner(tx, p, project)
      return (await tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId, projectSlug: project }, orderBy: { createdAt: 'desc' } })).map(publicCredential)
    })
  }
  async create(p: Principal, raw: unknown) {
    const command = agentGrantSchema.parse(raw)
    return this.db.$transaction(async tx => {
      const project = await this.owner(tx, p, command.project)
      const packages = z.array(z.string()).parse(project.packages)
      for (const scope of command.actions) {
        if (!packages.includes(scope.capability)) throw new KernelError('AGENT_SCOPE', 'Choose an action in this application.', 403)
        const cap = await tx.capability.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: scope.capability } } })
        if (!cap || cap.version !== scope.version) throw new KernelError('STALE_AGENT_SCOPE', 'Refresh the application before granting access.', 409)
        const action = definitionSchema.parse(cap.definition).actions.find(a => a.name === scope.action)
        if (!action?.roles.includes('operator')) throw new KernelError('AGENT_SCOPE', 'Agents can only propose actions available to operators.', 403)
      }
      const token = `krn_${randomBytes(32).toString('base64url')}`
      const credential = await tx.agentCredential.create({ data: { workspaceId: p.workspaceId, projectSlug: project.slug, name: command.name, createdBy: p.userId, actions: command.actions, tokenHash: digest(token), prefix: token.slice(0, 12), expiresAt: new Date(Date.now() + command.expiresInDays * 86400000) } })
      await tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action: 'agent.credential.create', outcome: 'applied', details: { projectSlug: project.slug, credentialId: credential.id, name: credential.name, actions: command.actions } } })
      return { credential: publicCredential(credential), token }
    })
  }
  async revoke(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      const grant = await tx.agentCredential.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!grant) throw new KernelError('NOT_FOUND', 'Credential not found.', 404)
      await this.owner(tx, p, grant.projectSlug)
      if (!grant.revokedAt) {
        await tx.agentCredential.update({ where: { id }, data: { revokedAt: new Date() } })
        await tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action: 'agent.credential.revoke', outcome: 'applied', details: { projectSlug: grant.projectSlug, credentialId: id, name: grant.name } } })
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
