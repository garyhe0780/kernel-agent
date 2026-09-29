import { accessInclude, effectiveMember, effectiveRole, hasOwnerAccess, memberProjectIds } from './member-access.server'
import { calendarDate, matchesView } from './application-views'
import { agentLimits, lockCredential, admitRun, admitOperation } from './agent-limits.server'
import { inspectRun } from './run-inspection.server'
import { agentRunSchema, agentRunCommandSchema, type RunReceipt, runRecovery } from './agent-runs'
import { planningContentSchema, planBrief } from './builder-plan'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { CREATE_ACTION, agentExecutionSchema, createProposalSchema, creationContract, creationValues, recordQuerySchema, snapshotRecordLimits, type RecordPageInfo } from './record-operations'
import { applySettings, definitionSchema, evaluate, toolContracts, validateFields, type Definition, type Principal, type RecordData } from './definition'
import { catalog, catalogFor, composePublic, seedFor } from './packages'
import { asStringList, projectTemplates, sortProjects, toProjectSnapshot } from './projects'
import { compileAssembly, validateApplication } from './application'
import { validateAssembly, type Assembly } from './assembly'
import { catalogSnapshot } from './modules'
import { blockCatalog } from './blocks'
import { grammarCatalog } from './grammars'
import { patternCatalog } from './patterns'
import { assemblePattern } from './compile'
import { canonical, namespaceApplication, planMigration, type MigrationPreview } from './migration'
import { DEMO_PURCHASING_SLUG, purchasingDemoApplication, purchasingDemoAssembly, purchasingDemoRequests, purchasingDemoSuppliers } from './purchasing-demo'

import { InputError, KernelError } from './errors'
export { KernelError } from './errors'
import { resolveAgent, authorizeAgentAction } from './agent-access.server'
type Tx = Prisma.TransactionClient
const zEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
const json = (value: unknown) => value as Prisma.InputJsonValue
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
/** Surfaces validation messages to the caller; any other failure propagates as a server error. */
function inputFailure(error: unknown, code: string, status?: number) {
  if (error instanceof KernelError) return error
  if (error instanceof InputError || error instanceof z.ZodError) return new KernelError(code, error.message, status)
  return error
}
/** Application members use the same record actions as operators, without workspace administration. */
function recordRole(role: string) {
  return role === 'application' ? 'operator' : role
}

export class Kernel {
  constructor(private db: PrismaClient) {}

  private async authorize(tx: Tx, principal: Principal, agent: false | 'operate' | 'construct' = false) {
    if (principal.agentCredentialId) {
      if (!agent) throw new KernelError('FORBIDDEN', 'Agent credentials can only read their application and stage scoped proposals.', 403)
      const access = await resolveAgent(tx, principal.agentCredentialId)
      if (access.p.agentGrant !== agent) throw new KernelError('FORBIDDEN', agent === 'construct' ? 'This credential can only stage proposals on its application.' : 'This credential creates applications over MCP; it cannot stage record changes.', 403)
      if (principal.kind !== 'agent' || principal.userId !== access.p.userId || principal.workspaceId !== access.p.workspaceId || principal.role !== access.p.role) throw new KernelError('FORBIDDEN', 'Invalid agent identity.', 403)
      return
    }
    const membership = await effectiveMember(tx, principal.workspaceId, principal.userId)
    if (!membership || membership.role !== principal.role) throw new KernelError('FORBIDDEN', 'You do not have access to this workspace.', 403)
  }

  private async grantedProjectIds(tx: Tx, p: Principal) {
    if (p.role !== 'application') return null
    return memberProjectIds(tx, p.workspaceId, p.userId)
  }

  private async assertApplicationCapability(tx: Tx, p: Principal, capability: string) {
    if (p.role !== 'application') return
    const ids = await memberProjectIds(tx, p.workspaceId, p.userId)
    const projects = await tx.project.findMany({ where: { workspaceId: p.workspaceId, id: { in: [...ids] } } })
    const packages = new Set(projects.flatMap(project => asStringList(project.packages)))
    if (!packages.has(capability)) throw new KernelError('FORBIDDEN', 'This record is outside your application.', 403)
  }

  private assertBuilder(p: Principal, message = 'Only owners can build projects.') {
    if (p.role !== 'owner' || (p.kind !== 'human' && p.agentGrant !== 'construct')) throw new KernelError('FORBIDDEN', message, 403)
  }

  private readDraft(row: { id: string; brief: string; definition: unknown; assembly?: unknown; version: number; status: string; source: string; projectSlug: string | null; baseProjectVersion: number | null; updatedAt: Date | string }) {
    return { ...row, definition: validateApplication(row.definition), assembly: row.assembly == null ? null : validateAssembly(row.assembly) }
  }

  private compileSave(command: { definition?: unknown; assembly?: unknown; pattern?: unknown }): { definition: ReturnType<typeof validateApplication>; assembly: Assembly | null } {
    if (typeof command.pattern === 'string' && command.pattern.trim()) {
      try {
        const assembly = assemblePattern(command.pattern.trim())
        return { assembly, definition: compileAssembly(assembly) }
      }
      catch (error) { throw inputFailure(error, 'INVALID_INPUT', 422) }
    }
    if (command.assembly !== undefined && command.assembly !== null) {
      try { return { assembly: validateAssembly(command.assembly), definition: compileAssembly(command.assembly) } }
      catch (error) { throw inputFailure(error, 'INVALID_INPUT', 422) }
    }
    if (command.definition === undefined) throw new KernelError('INVALID_INPUT', 'Provide a catalog pattern, an assembly of catalog modules, or a definition.', 400)
    try { return { assembly: null, definition: validateApplication(command.definition) } }
    catch (error) {
      if (error instanceof z.ZodError) throw error
      throw inputFailure(error, 'INVALID_INPUT', 422)
    }
  }

  private async capability(tx: Tx, workspaceId: string, slug: string) {
    const cap = await tx.capability.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } })
    if (!cap) throw new KernelError('NOT_FOUND', 'Capability not found.', 404)
    return { ...cap, definition: definitionSchema.parse(cap.definition) }
  }

  private async event(tx: Tx, p: Principal, action: string, outcome: string, details: unknown, recordId?: string, changeId?: string) {
    return tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.agentCredentialId ?? p.userId, actorName: p.name, actorKind: p.kind, action, outcome, details: json(details), recordId, changeId } })
  }

  private async installPackages(tx: Tx, workspaceId: string, userId: string, workspaceName: string) {
    for (const pkg of catalog) {
      const exists = await tx.capability.findUnique({ where: { workspaceId_slug: { workspaceId, slug: pkg.definition.slug } } })
      if (exists) continue
      await tx.capability.create({
        data: {
          workspaceId, slug: pkg.definition.slug, definition: json(pkg.definition),
          versions: { create: { version: 1, definition: json(pkg.definition), publishedBy: userId } },
        },
      })
      for (const seed of seedFor(pkg.definition.slug, workspaceName)) {
        await tx.businessRecord.create({
          data: {
            workspaceId, capability: pkg.definition.slug, entity: seed.entity, data: json(seed.data),
            createdAt: new Date(Date.now() - seed.hoursAgo * 3600000),
          },
        })
      }
    }
  }

  private async installProjects(tx: Tx, workspaceId: string) {
    for (const template of projectTemplates) {
      const exists = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId, slug: template.slug } } })
      if (exists) continue
      await tx.project.create({
        data: {
          workspaceId,
          slug: template.slug,
          name: template.name,
          shell: template.shell,
          packages: json(template.packages),
        },
      })
    }
  }

  /** Test/example fixture path. Ordinary workspaces install the purchasing demo instead. */
  private async bootstrap(tx: Tx, workspaceId: string, userId: string, workspaceName: string) {
    await this.installPackages(tx, workspaceId, userId, workspaceName)
    await this.installProjects(tx, workspaceId)
    const seedRecords = [
      { title: 'Design team software licenses', supplier: 'Figma', amountCents: 432000, category: 'Software', justification: 'Annual seats for the six-person product design team.', supplierVerified: true, status: 'submitted' },
      { title: 'Engineering monitors', supplier: 'Dell Technologies', amountCents: 284000, category: 'Equipment', justification: 'Four monitors for the incoming engineering team.', supplierVerified: true, status: 'submitted' },
      { title: 'Customer research study', supplier: 'Fieldwork Studio', amountCents: 1250000, category: 'Services', justification: 'Recruitment and interviews for the next product discovery cycle.', supplierVerified: true, status: 'submitted' },
      { title: 'Office supplies · September', supplier: 'Staples', amountCents: 34800, category: 'Office', justification: 'Monthly stationery and shared office essentials.', supplierVerified: true, status: 'draft' },
      { title: 'Security assessment', supplier: 'Northstar Security', amountCents: 680000, category: 'Services', justification: 'Independent review of the customer-facing application.', supplierVerified: false, status: 'submitted' },
      { title: 'Team documentation workspace', supplier: 'Notion', amountCents: 192000, category: 'Software', justification: 'Renewal of the internal documentation workspace.', supplierVerified: true, status: 'approved' },
    ]
    for (const [index, data] of seedRecords.entries()) {
      await tx.businessRecord.create({ data: { workspaceId, capability: 'procurement', entity: 'purchase_request', data: json({ ...data, decisionNote: '' }), createdAt: new Date(Date.now() - (seedRecords.length - index) * 3600000) } })
    }
  }

  private async installPurchasingDemo(tx: Tx, workspaceId: string, userId: string) {
    const exists = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId, slug: DEMO_PURCHASING_SLUG } } })
    if (exists) return { slug: DEMO_PURCHASING_SLUG, installed: false }
    const app = purchasingDemoApplication()
    const entities = namespaceApplication(app, DEMO_PURCHASING_SLUG)
    await tx.project.create({
      data: {
        workspaceId,
        slug: DEMO_PURCHASING_SLUG,
        name: app.name,
        description: app.description,
        definition: json(app),
        assembly: json(purchasingDemoAssembly()),
        shell: 'workbench',
        packages: json(entities.map(entity => entity.slug)),
        versions: { create: { version: 1, definition: json(app), migration: { kind: 'demo' }, publishedBy: userId } },
      },
    })
    for (const entity of entities) {
      await tx.capability.create({ data: { workspaceId, slug: entity.slug, definition: json(entity), versions: { create: { version: 1, definition: json(entity), publishedBy: userId } } } })
    }
    const suppliers = entities.find(entity => entity.slug.endsWith('__suppliers'))
    const requests = entities.find(entity => entity.slug.endsWith('__requests'))
    if (!suppliers || !requests) throw new KernelError('INTERNAL_ERROR', 'The purchasing demo could not be installed.', 500)
    const supplierIds = new Map<string, string>()
    for (const [index, data] of purchasingDemoSuppliers.entries()) {
      const record = await tx.businessRecord.create({
        data: {
          workspaceId,
          capability: suppliers.slug,
          entity: suppliers.entity.name,
          data: json(data),
          createdAt: new Date(Date.now() - (purchasingDemoSuppliers.length - index) * 3600000),
        },
      })
      supplierIds.set(String(data.title), record.id)
    }
    for (const request of purchasingDemoRequests) {
      const supplier = supplierIds.get(request.supplier)
      if (!supplier) throw new KernelError('INTERNAL_ERROR', 'The purchasing demo could not be installed.', 500)
      await tx.businessRecord.create({
        data: {
          workspaceId,
          capability: requests.slug,
          entity: requests.entity.name,
          data: json({ ...request.data, supplier }),
          createdAt: new Date(Date.now() - request.hoursAgo * 3600000),
        },
      })
    }
    return { slug: DEMO_PURCHASING_SLUG, installed: true }
  }

  async ensureWorkspace(user: { id: string; name: string }, examples = false) {
    const found = await this.db.membership.findFirst({ where: { userId: user.id }, orderBy: { id: 'asc' } })
    if (found) {
      return found
    }
    try {
      return await this.db.$transaction(async tx => {
        const again = await tx.membership.findFirst({ where: { userId: user.id }, orderBy: { id: 'asc' } })
        if (again) return again
        const workspace = await tx.workspace.create({ data: { name: `${user.name.split(' ')[0]}'s workspace` } })
        const member = await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'owner' } })
        if (examples) await this.bootstrap(tx, workspace.id, user.id, workspace.name)
        else await this.installPurchasingDemo(tx, workspace.id, user.id)
        await this.event(tx, { userId: user.id, name: user.name, workspaceId: workspace.id, role: 'owner', kind: 'human' }, 'workspace.create', 'applied', { message: 'Private workspace created.' })
        return member
      })
    } catch (error) {
      // A concurrent first request may have completed the same unique membership.
      const member = await this.db.membership.findFirst({ where: { userId: user.id }, orderBy: { id: 'asc' } })
      if (member) return member
      throw error
    }
  }

  async workspaceMembership(user: { id: string; name: string; email?: string }, workspaceId?: string) {
    if (!workspaceId) {
      const found = await this.db.membership.findFirst({ where: { userId: user.id }, orderBy: { id: 'asc' } })
      if (found) return (await effectiveMember(this.db, found.workspaceId, user.id))!
      const email = user.email?.trim().toLowerCase()
      if (email && await this.db.projectInvitation.findFirst({ where: { email, expiresAt: { gt: new Date() } } })) {
        throw new KernelError('INVITE_PENDING', 'Open your application invitation to finish joining.', 409)
      }
      return this.ensureWorkspace(user)
    }
    const member = await this.db.membership.findFirst({ where: { userId: user.id, workspaceId } })
    if (!member) throw new KernelError('FORBIDDEN', 'You do not have access to this workspace.', 403)
    return (await effectiveMember(this.db, member.workspaceId, user.id))!
  }

  async listWorkspaces(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only signed-in people can manage workspaces.', 403)
      const members = await tx.membership.findMany({ where: { userId: p.userId }, include: { ...accessInclude, workspace: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } })
      return members.map(member => ({ workspace: member.workspace, role: effectiveRole(member) }))
    })
  }

  async createWorkspace(p: Principal, name: string) {
    const next = name.trim()
    if (!next || next.length > 80) throw new KernelError('INVALID_NAME', 'Use a workspace name from 1 to 80 characters.', 422)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only signed-in people can create workspaces.', 403)
      if (p.role === 'application') throw new KernelError('FORBIDDEN', 'Application members use the application they were invited to.', 403)
      const workspace = await tx.workspace.create({ data: { name: next } })
      await tx.membership.create({ data: { workspaceId: workspace.id, userId: p.userId, role: 'owner' } })
      await this.event(tx, { ...p, workspaceId: workspace.id, role: 'owner' }, 'workspace.create', 'applied', { message: 'Private workspace created.' })
      return { id: workspace.id, name: workspace.name }
    })
  }

  async installPurchasingDemoProject(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only an owner can install the purchasing demo.', 403)
      const result = await this.installPurchasingDemo(tx, p.workspaceId, p.userId)
      if (result.installed) await this.event(tx, p, 'project.demo_install', 'applied', { projectSlug: result.slug })
      return result
    })
  }

  async removePurchasingDemoProject(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only an owner can remove the purchasing demo.', 403)
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${p.workspaceId} FOR UPDATE`
      const project = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: DEMO_PURCHASING_SLUG } } })
      if (!project) throw new KernelError('NOT_FOUND', 'The purchasing demo is not in this workspace.', 404)
      const packages = asStringList(project.packages)
      const drafts = await tx.projectDraft.findMany({ where: { workspaceId: p.workspaceId, projectSlug: DEMO_PURCHASING_SLUG }, select: { id: true } })
      if (drafts.length) await tx.builderPlan.deleteMany({ where: { workspaceId: p.workspaceId, draftId: { in: drafts.map(draft => draft.id) } } })
      await tx.projectDraft.deleteMany({ where: { workspaceId: p.workspaceId, projectSlug: DEMO_PURCHASING_SLUG } })
      await tx.agentCredential.deleteMany({ where: { workspaceId: p.workspaceId, projectSlug: DEMO_PURCHASING_SLUG } })
      if (packages.length) {
        await tx.changeSet.deleteMany({ where: { workspaceId: p.workspaceId, capability: { in: packages } } })
        await tx.businessRecord.deleteMany({ where: { workspaceId: p.workspaceId, capability: { in: packages } } })
        await tx.capability.deleteMany({ where: { workspaceId: p.workspaceId, slug: { in: packages } } })
      }
      await tx.project.delete({ where: { id: project.id } })
      await this.event(tx, p, 'project.demo_remove', 'applied', { projectSlug: DEMO_PURCHASING_SLUG })
      return { removed: true }
    })
  }

  async workspaceSettings(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only an owner can manage workspace settings.', 403)
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: p.workspaceId }, select: { id: true, name: true, createdAt: true } })
      const members = await tx.membership.findMany({ where: { workspaceId: p.workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { id: 'asc' } })
      const invitations = await tx.workspaceInvitation.findMany({ where: { workspaceId: p.workspaceId, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: 'desc' } })
      return { workspace, members, invitations }
    })
  }

  async inviteMember(p: Principal, email: string, role: string) {
    const address = email.trim().toLowerCase()
    if (!zEmail(address) || !['owner', 'operator'].includes(role)) throw new KernelError('INVALID_INVITE', 'Enter a valid email and workspace role.', 422)
    const token = randomUUID() + randomUUID()
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only owners can invite members.', 403)
      const members = await tx.membership.findMany({ where: { workspaceId: p.workspaceId }, include: { user: true } })
      if (members.some(m => m.role !== 'application' && m.user.email.toLowerCase() === address)) throw new KernelError('ALREADY_MEMBER', 'This person already belongs to this workspace.', 409)
      await tx.workspaceInvitation.deleteMany({ where: { workspaceId: p.workspaceId, email: address } })
      const invite = await tx.workspaceInvitation.create({ data: { workspaceId: p.workspaceId, createdBy: p.userId, email: address, role, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * 86400000) } })
      await this.event(tx, p, 'member.invite', 'applied', { email: address, role })
      return { token, expiresAt: invite.expiresAt }
    })
  }

  async revokeInvitation(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only owners can revoke invitations.', 403)
      const result = await tx.workspaceInvitation.deleteMany({ where: { id, workspaceId: p.workspaceId } })
      if (!result.count) throw new KernelError('NOT_FOUND', 'Invitation no longer exists. Refresh the list.', 404)
      await this.event(tx, p, 'member.invitation_revoke', 'applied', { invitationId: id })
      return { revoked: true }
    })
  }

  async previewInvitation(p: Principal, token: string) {
    if (p.kind !== 'human' || p.agentCredentialId) throw new KernelError('FORBIDDEN', 'Sign in to view an invitation.', 403)
    const invite = await this.db.workspaceInvitation.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    const user = await this.db.user.findUnique({ where: { id: p.userId } })
    if (!invite || invite.expiresAt <= new Date() || !user || user.email.toLowerCase() !== invite.email) throw new KernelError('INVALID_INVITE', 'This invitation is expired, revoked, or belongs to a different email address.', 403)
    if (!await hasOwnerAccess(this.db, invite.workspaceId, invite.createdBy)) throw new KernelError('INVALID_INVITE', 'The inviter no longer has owner access. Ask an owner for a new invitation.', 403)
    const workspace = await this.db.workspace.findUnique({ where: { id: invite.workspaceId } })
    if (!workspace) throw new KernelError('NOT_FOUND', 'Workspace no longer exists.', 404)
    return { workspaceName: workspace.name, role: invite.role, email: invite.email }
  }

  async acceptInvitation(p: Principal, token: string) {
    return this.db.$transaction(async tx => {
      if (p.kind !== 'human' || p.agentCredentialId) throw new KernelError('FORBIDDEN', 'Sign in to accept an invitation.', 403)
      const invite = await tx.workspaceInvitation.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
      const user = await tx.user.findUnique({ where: { id: p.userId } })
      if (!invite || invite.expiresAt <= new Date() || !user || user.email.toLowerCase() !== invite.email) throw new KernelError('INVALID_INVITE', 'This invitation is expired, revoked, or belongs to a different email address.', 403)
      if (!await hasOwnerAccess(tx, invite.workspaceId, invite.createdBy)) throw new KernelError('INVALID_INVITE', 'The inviter no longer has owner access. Ask an owner for a new invitation.', 403)
      const workspace = await tx.workspace.findUnique({ where: { id: invite.workspaceId } })
      if (!workspace) throw new KernelError('NOT_FOUND', 'Workspace no longer exists.', 404)
      const existing = await tx.membership.findFirst({ where: { workspaceId: invite.workspaceId, userId: p.userId } })
      if (!existing) await tx.membership.create({ data: { workspaceId: invite.workspaceId, userId: p.userId, role: invite.role } })
      const upgraded = existing?.role === 'application'
      if (upgraded) {
        await tx.membership.update({ where: { id: existing.id }, data: { role: invite.role } })
        await tx.projectMember.deleteMany({ where: { userId: p.userId, project: { workspaceId: invite.workspaceId } } })
      }
      await tx.workspaceInvitation.delete({ where: { id: invite.id } })
      const role = !existing || upgraded ? invite.role : existing.role
      await this.event(tx, { ...p, workspaceId: invite.workspaceId, role }, upgraded ? 'member.role_change' : 'member.join', 'applied', upgraded ? { userId: p.userId, before: 'application', after: invite.role } : { userId: p.userId })
      return { workspaceId: invite.workspaceId, name: workspace.name }
    })
  }

  async inviteApplicationUser(p: Principal, projectSlug: string, email: string) {
    const address = email.trim().toLowerCase()
    if (!zEmail(address)) throw new KernelError('INVALID_INVITE', 'Enter a valid email address.', 422)
    const token = randomUUID() + randomUUID()
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only an owner can invite someone to an application.', 403)
      const project = await tx.project.findFirst({ where: { workspaceId: p.workspaceId, slug: projectSlug } })
      if (!project) throw new KernelError('NOT_FOUND', 'Application not found.', 404)
      const person = await tx.user.findUnique({ where: { email: address } })
      if (person) {
        const membership = await tx.membership.findFirst({ where: { workspaceId: p.workspaceId, userId: person.id } })
        if (membership && membership.role !== 'application') throw new KernelError('ALREADY_MEMBER', 'This person already belongs to this workspace.', 409)
        if (await tx.projectMember.findFirst({ where: { projectId: project.id, userId: person.id } })) throw new KernelError('ALREADY_MEMBER', 'This person already uses this application.', 409)
      }
      await tx.projectInvitation.deleteMany({ where: { projectId: project.id, email: address } })
      const invite = await tx.projectInvitation.create({ data: { projectId: project.id, email: address, createdBy: p.userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 86400000) } })
      await this.event(tx, p, 'application.invite', 'applied', { email: address, projectSlug })
      return { token, expiresAt: invite.expiresAt, projectName: project.name }
    })
  }

  async acceptApplicationInvite(user: { id: string; name: string; email: string }, token: string) {
    const address = user.email.trim().toLowerCase()
    return this.db.$transaction(async tx => {
      const invite = await tx.projectInvitation.findUnique({ where: { tokenHash: tokenHash(token) }, include: { project: true } })
      if (!invite || invite.expiresAt <= new Date() || invite.email !== address) throw new KernelError('INVALID_INVITE', 'This invitation is expired, revoked, or belongs to a different email address.', 403)
      if (!await hasOwnerAccess(tx, invite.project.workspaceId, invite.createdBy)) throw new KernelError('INVALID_INVITE', 'The inviter no longer has owner access. Ask an owner for a new invitation.', 403)
      const existing = await tx.membership.findFirst({ where: { workspaceId: invite.project.workspaceId, userId: user.id } })
      if (!existing) await tx.membership.create({ data: { workspaceId: invite.project.workspaceId, userId: user.id, role: 'application' } })
      if (!existing || existing.role === 'application') {
        await tx.projectMember.upsert({ where: { projectId_userId: { projectId: invite.projectId, userId: user.id } }, update: {}, create: { projectId: invite.projectId, userId: user.id } })
      }
      await tx.projectInvitation.delete({ where: { id: invite.id } })
      await this.event(tx, { userId: user.id, name: user.name, workspaceId: invite.project.workspaceId, role: existing?.role ?? 'application', kind: 'human' }, 'application.join', 'applied', { projectSlug: invite.project.slug })
      return { workspaceId: invite.project.workspaceId, projectSlug: invite.project.slug, name: invite.project.name }
    })
  }

  async updateMember(p: Principal, userId: string, expectedRole: string, role: 'owner' | 'operator' | 'remove') {
    if (!['owner', 'operator', 'remove'].includes(role) || !['owner', 'operator', 'application'].includes(expectedRole)) throw new KernelError('INVALID_ROLE', 'Choose owner or operator.', 422)
    if (expectedRole === 'application' && role !== 'remove') throw new KernelError('INVALID_ROLE', 'Application members can be removed. Invite them again from the application to restore access.', 422)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only owners can manage members.', 403)
      if (userId === p.userId) throw new KernelError('SELF_CHANGE', 'Ask another owner to change your access.', 409)
      const where = { workspaceId: p.workspaceId, userId, role: expectedRole }
      const changed = role === 'remove' ? await tx.membership.deleteMany({ where }) : await tx.membership.updateMany({ where, data: { role } })
      if (!changed.count) throw new KernelError('CONFLICT', 'Membership changed. Refresh before trying again.', 409)
      if (role === 'remove') await tx.projectMember.deleteMany({ where: { userId, project: { workspaceId: p.workspaceId } } })
      if (role !== 'owner') await tx.workspaceInvitation.deleteMany({ where: {workspaceId:p.workspaceId,createdBy:userId} })
      await this.event(tx, p, role === 'remove' ? 'member.remove' : 'member.role_change', 'applied', { userId, before: expectedRole, after: role })
      return { updated: true }
    })
  }

  async renameWorkspace(p: Principal, name: string, expectedName: string) {
    const next = name.trim()
    if (!next || next.length > 80) throw new KernelError('INVALID_NAME', 'Use a workspace name from 1 to 80 characters.', 422)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only an owner can manage workspace settings.', 403)
      const changed = await tx.workspace.updateMany({ where: { id: p.workspaceId, name: expectedName }, data: { name: next } })
      if (!changed.count) throw new KernelError('CONFLICT', 'The workspace name changed. Discard your edits, then refresh to load the current name.', 409)
      if (next !== expectedName) await this.event(tx, p, 'workspace.rename', 'applied', { before: expectedName, after: next })
      return { name: next }
    })
  }

  async activity(p: Principal, cursor?: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role === 'application') throw new KernelError('FORBIDDEN', 'Open your application to see its activity.', 403)
      if (cursor && !await tx.execution.findFirst({ where: { id: cursor, workspaceId: p.workspaceId } })) throw new KernelError('NOT_FOUND', 'Activity page not found. Refresh to start again.', 404)
      const rows = await tx.execution.findMany({ where: { workspaceId: p.workspaceId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      const projects = (await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).map(toProjectSnapshot)
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, id: { in: rows.flatMap(row => row.recordId ? [row.recordId] : []) } } })
      const items = rows.slice(0, 50).map(row => {
        const details = row.details as Record<string, unknown>
        const record = records.find(item => item.id === row.recordId)
        const project = projects.find(item => item.slug === details.projectSlug) ?? projects.find(item => item.packages.some(cap => cap === record?.capability || row.action.startsWith(`${cap}.`)))
        const title = (record?.data as RecordData | undefined)?.title
        return { id: row.id, action: row.action, outcome: row.outcome, actorName: row.actorName, actorKind: row.actorKind, createdAt: row.createdAt, projectSlug: project?.slug ?? null, projectName: project?.name ?? null, recordTitle: typeof title === 'string' ? title : null }
      })
      return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null }
    })
  }

  async inbox(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role === 'application') throw new KernelError('FORBIDDEN', 'Open your application to review its work.', 403)
      const changes = await tx.changeSet.findMany({ where: { workspaceId: p.workspaceId, status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const projects = (await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).map(toProjectSnapshot)
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, id: { in: changes.map(change => change.recordId) } } })
      const caps = await tx.capability.findMany({ where: { workspaceId: p.workspaceId, slug: { in: [...new Set(changes.map(change => change.capability))] } }, select: { slug: true, version: true } })
      return changes.map(change => {
        const project = projects.find(item => item.packages.includes(change.capability))
        const record = records.find(item => item.id === change.recordId)
        const title = (change.kind === 'create' ? change.after as RecordData : record?.data as RecordData | undefined)?.title
        return { id: change.id, projectSlug: project?.slug ?? null, projectName: project?.name ?? 'Unavailable application', title: typeof title === 'string' ? title : 'Unavailable record', action: change.kind === 'create' ? 'Create record' : change.action, actorKind: change.actorKind, createdAt: change.createdAt, stale: caps.find(cap => cap.slug === change.capability)?.version !== change.definitionVersion || (change.kind !== 'create' && (!record || record.version !== change.recordVersion)) }
      })
    })
  }

  /** `limits` raises how many of the newest records load per entity, in page steps up to the ceiling. */
  async snapshot(p: Principal, projectSlug?: string, limits: Record<string, number> = {}) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: p.workspaceId } })
      const granted = await this.grantedProjectIds(tx, p)
      const projectRows = sortProjects(await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).filter(row => !granted || granted.has(row.id))
      const projects = projectRows.map(toProjectSnapshot)
      const caps = await tx.capability.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { slug: 'asc' } })
      const allCapabilities = caps.map(cap => ({ ...cap, definition: definitionSchema.parse(cap.definition) }))
      const current = projectSlug ? projects.find(item => item.slug === projectSlug) : undefined
      if (projectSlug && !current) throw new KernelError('NOT_FOUND', 'Project not found.', 404)
      const slugs = current ? new Set(current.packages) : granted ? new Set(projects.flatMap(item => item.packages)) : undefined
      const scope = { workspaceId: p.workspaceId, ...(slugs ? { capability: { in: [...slugs] } } : {}) }
      const capabilities = current
        ? current.packages.map(slug => allCapabilities.find(cap => cap.slug === slug)).filter((cap): cap is typeof allCapabilities[number] => Boolean(cap))
        : slugs ? allCapabilities.filter(cap => slugs.has(cap.slug)) : allCapabilities
      const limitFor = (slug: string) => {
        const requested = Math.ceil((Number.isFinite(limits[slug]) ? limits[slug] : 0) / snapshotRecordLimits.page) * snapshotRecordLimits.page
        return Math.min(snapshotRecordLimits.max, Math.max(snapshotRecordLimits.page, requested))
      }
      const [pages, totals, scopedChanges, allExecutions] = await Promise.all([
        Promise.all(capabilities.map(cap => tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: cap.slug }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limitFor(cap.slug) }))),
        tx.businessRecord.groupBy({ by: ['capability'], where: scope, _count: { _all: true } }),
        Promise.all([
          tx.changeSet.findMany({ where: { ...scope, status: 'pending' }, orderBy: { createdAt: 'desc' } }),
          tx.changeSet.findMany({ where: { ...scope, status: { not: 'pending' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
        ]).then(([pending, history]) => [...pending, ...history].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
        tx.execution.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      ])
      const paged = pages.flat()
      const loadedIds = new Set(paged.map(record => record.id))
      // Records outside the loaded pages still resolve when a loaded record links to them or a pending proposal targets them.
      const missing = new Set<string>()
      for (const [index, cap] of capabilities.entries()) {
        const references = Object.entries(cap.definition.entity.fields).filter(([, field]) => field.reference).map(([key]) => key)
        for (const record of pages[index]) for (const key of references) {
          const value = (record.data as RecordData)[key]
          if (typeof value === 'string' && value && !loadedIds.has(value)) missing.add(value)
        }
      }
      for (const change of scopedChanges) if (change.status === 'pending' && change.kind !== 'create' && !loadedIds.has(change.recordId)) missing.add(change.recordId)
      const ids = [...missing]
      const extras = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 5000) }, (_, chunk) => tx.businessRecord.findMany({ where: { ...scope, id: { in: ids.slice(chunk * 5000, (chunk + 1) * 5000) } } })))).flat()
      const records = [...paged, ...extras].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      const recordPages: Record<string, RecordPageInfo> = Object.fromEntries(capabilities.map((cap, index) => [cap.slug, { loaded: pages[index].length, total: totals.find(row => row.capability === cap.slug)?._count._all ?? 0 }]))
      const recordIds = new Set(records.map(record => record.id))
      const [proposers, credentials] = await Promise.all([
        tx.user.findMany({ where: { id: { in: [...new Set(scopedChanges.map(change => change.proposedBy))] } }, select: { id: true, name: true } }),
        tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId, id: { in: scopedChanges.flatMap(change => change.agentCredentialId ? [change.agentCredentialId] : []) } }, select: { id: true, name: true } }),
      ])
      const changes = scopedChanges.map(change => ({ ...change, proposerName: change.agentCredentialId ? credentials.find(item => item.id === change.agentCredentialId)?.name ?? 'Revoked agent' : `${proposers.find(item => item.id === change.proposedBy)?.name ?? 'Former member'}${change.actorKind === 'agent' ? ' · agent' : ''}` }))
      const executions = slugs ? allExecutions.filter(event => {
        if ((event.details as Record<string, unknown>).projectSlug === current?.slug) return true
        if (event.recordId) return recordIds.has(event.recordId) || scopedChanges.some(change => change.recordId === event.recordId)
        if (event.action === 'capability.publish') {
          const capability = (event.details as Record<string, unknown>).capability
          return typeof capability === 'string' && slugs.has(capability)
        }
        return slugs.has(event.action.split('.')[0] ?? '')
      }) : allExecutions
      const installed = current ? catalogFor(current.packages) : catalog
      const tools = capabilities.flatMap(cap => toolContracts(cap.definition))
      const capability = (current
        ? capabilities.find(cap => cap.slug === current.packages[0])
        : capabilities[0])
      return { workspace, project: current, projects, capability, capabilities, records, recordPages, changes, executions, tools, catalog: installed, principal: p, members: await this.assignmentMembers(tx, p, current?.slug) }
    })
  }

  private async assignmentMembers(tx: Tx, p: Principal, projectSlug?: string) {
    const members = await tx.membership.findMany({ where: { workspaceId: p.workspaceId }, include: { ...accessInclude, user: { select: { id: true, name: true } } }, orderBy: { userId: 'asc' } })
    const project = projectSlug ? await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug: projectSlug } } }) : null
    const visible = await Promise.all(members.map(async member => ['owner', 'operator'].includes(effectiveRole(member)) || (effectiveRole(member) === 'application' && project && (await memberProjectIds(tx, p.workspaceId, member.userId)).has(project.id)) ? member.user : null))
    return visible.filter((user): user is { id: string; name: string } => user !== null)
  }

  private async validateReferences(tx: Tx, p: Principal, fields: Record<string, import('./definition').Field>, data: RecordData, capability?: string, recordId?: string) {
    if (p.agentCredentialId) await lockCredential(tx, p.agentCredentialId)
    // Definition changes hold the workspace row FOR UPDATE, so sharing it excludes publication without serializing record writes.
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${p.workspaceId} FOR SHARE`
    // Lock the written record before scanning its dependents, and share-lock referenced records and assigned members before reading them.
    // A concurrent edit of either side then waits for this commit and rescans committed data.
    if (recordId) await tx.$queryRaw`SELECT "id" FROM "BusinessRecord" WHERE "id" = ${recordId} AND "workspaceId" = ${p.workspaceId} FOR UPDATE`
    const linked = (test: (field: import('./definition').Field) => boolean) => [...new Set(Object.entries(fields).flatMap(([key, field]) => test(field) && typeof data[key] === 'string' && data[key] && data[key] !== recordId ? [data[key] as string] : []))].sort()
    const targets = linked(field => Boolean(field.reference))
    if (targets.length) await tx.$queryRaw`SELECT "id" FROM "BusinessRecord" WHERE "workspaceId" = ${p.workspaceId} AND "id" IN (${Prisma.join(targets)}) ORDER BY "id" FOR SHARE`
    const assignees = linked(field => field.format === 'user')
    if (assignees.length) await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "workspaceId" = ${p.workspaceId} AND "userId" IN (${Prisma.join(assignees)}) ORDER BY "id" FOR SHARE`
    const definitions = await tx.capability.findMany({ where: { workspaceId: p.workspaceId } })
    const current = definitions.find(item => item.slug === capability)?.definition as Definition | undefined
    if (current && canonical(current.entity.fields) !== canonical(fields)) throw new KernelError('STALE_RECORD', 'The definition changed. Refresh before saving.', 409)
    if (recordId && capability) {
      for (const entry of definitions) {
        const definition = entry.definition as Definition
        for (const [key, field] of Object.entries(definition.entity.fields)) {
          if (field.reference !== capability || !field.referenceMatch) continue
          const dependents: { id: string; data: Prisma.JsonValue }[] = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: entry.slug, data: { path: [key], equals: recordId } } })
          for (const dependent of dependents) {
            const source: RecordData = dependent.id === recordId ? data : dependent.data as RecordData
            if (source[key] !== recordId) continue
            if (!source[field.referenceMatch.sourceField] || data[field.referenceMatch.targetField] !== source[field.referenceMatch.sourceField]) throw new KernelError('INVALID_REFERENCE', `This change would invalidate a linked ${definition.entity.label.toLowerCase()}. Update or clear its ${field.label.toLowerCase()} first.`, 409)
          }
        }
      }
    }
    for (const [key, field] of Object.entries(fields)) {
      if (field.format === 'user' && data[key]) {
        const member = await effectiveMember(tx, p.workspaceId, String(data[key]))
        if (!member || !['owner', 'operator', 'application'].includes(member.role)) throw new KernelError('INVALID_REFERENCE', `Choose an active workspace member for ${field.label}.`)
        if (capability) await this.assertApplicationCapability(tx, { ...p, userId: member.userId, role: member.role }, capability)
      }
      if (!field.reference) continue
      if (data[key] === undefined || data[key] === '') {
        if (field.required) throw new KernelError('INVALID_REFERENCE', `Choose an existing ${field.label} in this project.`)
        continue
      }
      const target = await tx.businessRecord.findFirst({ where: { id: String(data[key]), workspaceId: p.workspaceId, capability: field.reference } })
      if (!target) throw new KernelError('INVALID_REFERENCE', `Choose an existing ${field.label} in this project.`)
      if (field.referenceMatch) {
        const targetData = target.id === recordId ? data : target.data as RecordData
        if (!data[field.referenceMatch.sourceField] || targetData[field.referenceMatch.targetField] !== data[field.referenceMatch.sourceField]) throw new KernelError('INVALID_REFERENCE', `${field.label} must match the selected ${fields[field.referenceMatch.sourceField].label.toLowerCase()}.`, 422)
      }
    }
  }

  async listPlans(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role !== 'owner' || p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only owners can plan applications.', 403)
      const plans = await tx.builderPlan.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { updatedAt: 'desc' } })
      return plans.map(plan => ({ ...plan, content: planningContentSchema.parse(plan.content) }))
    })
  }

  async savePlan(p: Principal, command: { id?: string; expectedVersion?: number; draftId?: string; content: unknown }) {
    const content = planningContentSchema.parse(command.content)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role !== 'owner' || p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only owners can plan applications.', 403)
      if (command.id) {
        const existing = await tx.builderPlan.findFirst({ where: { id: command.id, workspaceId: p.workspaceId } })
        const previous = existing ? planningContentSchema.parse(existing.content) : null
        content.needsProposal = !content.proposal || Boolean(previous?.needsProposal) || Boolean(previous && (JSON.stringify(previous.messages) !== JSON.stringify(content.messages) || JSON.stringify(previous.answers) !== JSON.stringify(content.answers) || previous.request !== content.request))
        const linked = existing?.draftId ? await tx.projectDraft.findFirst({ where: { id: existing.draftId, workspaceId: p.workspaceId, status: 'draft' } }) : null
        if (existing?.draftId && !linked) throw new KernelError('STALE_DRAFT', 'Start a new change draft for the published application.', 409)
        const changed = await tx.builderPlan.updateMany({ where: { id: command.id, workspaceId: p.workspaceId, version: command.expectedVersion ?? -1 }, data: { content: json(content), draftVersion: linked?.version, status: 'planning', version: { increment: 1 } } })
        if (changed.count !== 1) throw new KernelError('STALE_PLAN', 'This plan changed. Reopen it before saving.', 409)
        return tx.builderPlan.findUniqueOrThrow({ where: { id: command.id } })
      }
      const draft = command.draftId ? await tx.projectDraft.findFirst({ where: { id: command.draftId, workspaceId: p.workspaceId, status: 'draft' } }) : null
      if (command.draftId && !draft) throw new KernelError('NOT_FOUND', 'Draft not found.', 404)
      return tx.builderPlan.create({ data: { workspaceId: p.workspaceId, draftId: draft?.id, draftVersion: draft?.version, content: json(content) } })
    })
  }

  async planState(p: Principal, id: string, version: number, status?: string, content?: unknown) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role !== 'owner' || p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only owners can plan applications.', 403)
      const plan = await tx.builderPlan.findFirst({ where: { id, workspaceId: p.workspaceId, version } })
      if (!plan) throw new KernelError('STALE_PLAN', 'This plan changed. Reopen it before continuing.', 409)
      const value = planningContentSchema.parse(content ?? plan.content)
      if (status === 'confirmed' && (!value.proposal || value.proposal.questions.length || value.needsProposal)) throw new KernelError('PLAN_INCOMPLETE', 'Update the plan with saved changes and resolve open questions before confirming.', 409)
      if (status === 'building' && plan.status !== 'confirmed') throw new KernelError('PLAN_NOT_CONFIRMED', 'Confirm the current plan before building.', 409)
      if (!status) return { ...plan, content: value }
      const updated = await tx.builderPlan.update({ where: { id }, data: { status, content: json(value), version: { increment: 1 } } })
      return { ...updated, content: value }
    })
  }

  async finishPlan(p: Principal, id: string, version: number, raw: unknown, jobLease?: { id: string; token: string }) {
    const save = this.compileSave(raw && typeof raw === 'object' && raw !== null && 'modules' in raw && !('entities' in raw) ? { assembly: raw } : { definition: raw })
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.role !== 'owner' || p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only owners can build applications.', 403)
      const plan = await tx.builderPlan.findFirst({ where: { id, workspaceId: p.workspaceId, version, status: 'building' } })
      if (!plan) throw new KernelError('STALE_PLAN', 'The plan changed while building. The result was not saved.', 409)
      if (jobLease && !await tx.buildJob.findFirst({ where: { id: jobLease.id, workspaceId: p.workspaceId, planId: id, planVersion: version, status: 'running', leaseToken: jobLease.token, leaseUntil: { gt: new Date() } } })) throw new KernelError('BUILD_LEASE_LOST', 'Another worker resumed this build. This late result was discarded.', 409)
      const content = planningContentSchema.parse(plan.content)
      const brief = planBrief(content.proposal!.plan)
      const payload = { brief, definition: json(save.definition), assembly: save.assembly ? json(save.assembly) : Prisma.DbNull, source: 'model' as const, preview: Prisma.DbNull }
      let draft
      if (plan.draftId) {
        const changed = await tx.projectDraft.updateMany({ where: { id: plan.draftId, workspaceId: p.workspaceId, status: 'draft', version: plan.draftVersion ?? -1 }, data: { ...payload, version: { increment: 1 } } })
        if (changed.count !== 1) throw new KernelError('STALE_DRAFT', 'The saved preview changed. Reopen it before building.', 409)
        draft = await tx.projectDraft.findUniqueOrThrow({ where: { id: plan.draftId } })
      } else draft = await tx.projectDraft.create({ data: { workspaceId: p.workspaceId, ...payload, createdBy: p.userId } })
      await tx.builderPlan.update({ where: { id }, data: { status: 'generated', draftId: draft.id, draftVersion: draft.version, version: { increment: 1 } } })
      if (jobLease) {
        const job = await tx.buildJob.findUniqueOrThrow({ where: { id: jobLease.id } })
        const events = job.events as unknown as import('./build-job').BuildJobEvent[]
        await tx.buildJob.update({ where: { id: jobLease.id }, data: { status: 'completed', draftId: draft.id, leaseToken: null, leaseUntil: null, revision: { increment: 1 }, events: json([...events, { id: events.length + 1, task: 'assemble', message: 'Your application is ready to try. Nothing has been published.', at: new Date().toISOString() }]) } })
      }
      await this.event(tx, { ...p, kind: 'agent' }, 'project.draft', 'staged', { draftId: draft.id, planId: id, planVersion: version })
      return this.readDraft(draft)
    })
  }

  async listModules(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can list catalog modules.')
      return catalogSnapshot()
    })
  }

  async listBlocks(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can list catalog blocks.')
      return blockCatalog()
    })
  }

  async listGrammars(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can list catalog grammars.')
      return grammarCatalog()
    })
  }

  async listPatterns(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can list catalog patterns.')
      return patternCatalog()
    })
  }

  async listApplications(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can list applications.')
      return sortProjects(await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).map(row => {
        const project = toProjectSnapshot(row)
        return { slug: project.slug, name: project.name, version: project.version, editable: project.editable, demo: project.demo }
      })
    })
  }

  async listDrafts(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p)
      return (await tx.projectDraft.findMany({ where: { workspaceId: p.workspaceId, status: 'draft' }, orderBy: { updatedAt: 'desc' } })).map(draft => this.readDraft(draft))
    })
  }

  async getDraft(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p)
      const draft = await tx.projectDraft.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!draft) throw new KernelError('NOT_FOUND', 'Draft not found.', 404)
      return this.readDraft(draft)
    })
  }

  async saveDraft(p: Principal, command: { brief: string; source: string; definition?: unknown; assembly?: unknown; pattern?: unknown; id?: string; expectedVersion?: number }) {
    const { definition, assembly } = this.compileSave(command)
    if (command.brief.length > 4000) throw new KernelError('INVALID_INPUT', 'Keep the description under 4,000 characters.')
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p)
      const payload = { brief: command.brief, definition: json(definition), assembly: assembly ? json(assembly) : Prisma.DbNull, source: command.source, preview: Prisma.DbNull }
      if (command.id) {
        const changed = await tx.projectDraft.updateMany({ where: { id: command.id, workspaceId: p.workspaceId, status: 'draft', version: command.expectedVersion ?? -1 }, data: { ...payload, version: { increment: 1 } } })
        if (changed.count !== 1) throw new KernelError('STALE_DRAFT', 'This draft changed. Reopen it before saving.', 409)
      }
      const draft = command.id
        ? await tx.projectDraft.findUniqueOrThrow({ where: { id: command.id } })
        : await tx.projectDraft.create({ data: { workspaceId: p.workspaceId, ...payload, createdBy: p.userId } })
      await this.event(tx, p, 'project.draft', 'staged', { draftId: draft.id, version: draft.version, source: command.source })
      return this.readDraft(draft)
    })
  }

  private async applicationState(tx: Tx, p: Principal, slug: string) {
    const project = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug } } })
    if (!project) throw new KernelError('NOT_FOUND', 'Project not found.', 404)
    if (!project.definition) throw new KernelError('UNSUPPORTED_PROJECT', 'This legacy project does not have an application definition. Create a builder application to use versioned changes.', 409)
    const app = validateApplication(project.definition)
    const expected = namespaceApplication(app, slug)
    const slugs = expected.map(e => e.slug)
    const [capabilities, records, pending] = await Promise.all([
      tx.capability.findMany({ where: { workspaceId: p.workspaceId, slug: { in: slugs } }, orderBy: { slug: 'asc' } }),
      tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: { in: slugs } }, orderBy: { id: 'asc' } }),
      tx.changeSet.findMany({ where: { workspaceId: p.workspaceId, capability: { in: slugs }, status: 'pending' }, orderBy: { id: 'asc' } }),
    ])
    if (canonical(project.packages) !== canonical(slugs) || expected.some(e => canonical(capabilities.find(c => c.slug === e.slug)?.definition) !== canonical(e))) throw new KernelError('DEFINITION_DRIFT', 'The installed definitions differ from the published application. Resolve the configuration mismatch before publishing changes.', 409)
    const fingerprint = createHash('sha256').update(canonical({ projectVersion: project.version, capabilities, records, pending })).digest('hex')
    return { project, app, capabilities, records: records.map(r => ({ ...r, data: r.data as RecordData })), pending, fingerprint }
  }

  async editProject(p: Principal, slug: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can change applications.')
      const { project, app } = await this.applicationState(tx, p, slug)
      const existing = await tx.projectDraft.findFirst({ where: { workspaceId: p.workspaceId, projectSlug: slug, baseProjectVersion: project.version, status: 'draft' }, orderBy: { updatedAt: 'desc' } })
      if (existing) return this.readDraft(existing)
      const draft = await tx.projectDraft.create({ data: { workspaceId: p.workspaceId, brief: `Revise ${project.name}.`, definition: json(app), assembly: project.assembly == null ? Prisma.DbNull : json(project.assembly), source: 'manual', createdBy: p.userId, projectSlug: slug, baseProjectVersion: project.version } })
      await this.event(tx, p, 'project.draft', 'staged', { projectSlug: slug, draftId: draft.id, baseProjectVersion: project.version })
      return this.readDraft(draft)
    })
  }

  async projectHistory(p: Principal, slug: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can inspect application versions.')
      const project = await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: p.workspaceId, slug } } })
      if (!project) throw new KernelError('NOT_FOUND', 'Project not found.', 404)
      return tx.projectVersion.findMany({ where: { projectId: project.id }, orderBy: { version: 'desc' } })
    })
  }

  async previewMigration(p: Principal, id: string, expectedVersion: number): Promise<MigrationPreview> {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only owners can preview application changes.')
      const draft = await tx.projectDraft.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!draft) throw new KernelError('NOT_FOUND', 'Draft not found.', 404)
      if (draft.status !== 'draft' || draft.version !== expectedVersion || !draft.projectSlug || !draft.baseProjectVersion) throw new KernelError('STALE_DRAFT', 'Open the current application draft before previewing changes.', 409)
      const state = await this.applicationState(tx, p, draft.projectSlug)
      if (state.project.version !== draft.baseProjectVersion) throw new KernelError('STALE_PROJECT', 'A newer application version exists. Start a new change draft from Configure.', 409)
      const { report } = planMigration(state.app, draft.definition, draft.projectSlug, state.records, state.pending)
      const preview = { token: randomUUID(), draftVersion: draft.version, projectVersion: state.project.version, report }
      const updated = await tx.projectDraft.updateMany({ where: { id, workspaceId: p.workspaceId, status: 'draft', version: expectedVersion }, data: { preview: json({ ...preview, fingerprint: state.fingerprint }) } })
      if (updated.count !== 1) throw new KernelError('STALE_DRAFT', 'The draft changed during preview. Try again.', 409)
      return preview
    })
  }

  async publishDraft(p: Principal, id: string, expectedVersion: number, previewToken?: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'construct')
      this.assertBuilder(p, 'Only an owner can publish a project.')
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${p.workspaceId} FOR UPDATE`
      const draft = await tx.projectDraft.findFirst({ where: { id, workspaceId: p.workspaceId } })
      if (!draft) throw new KernelError('NOT_FOUND', 'Draft not found.', 404)
      const plan = await tx.builderPlan.findUnique({ where: { draftId: id } })
      if (plan && plan.status !== 'generated') throw new KernelError('PLAN_NOT_BUILT', 'Build the current confirmed plan before publishing this preview.', 409)
      if (draft.status === 'published' && draft.publishedVersion === expectedVersion) return { slug: draft.projectSlug!, version: (draft.baseProjectVersion ?? 0) + 1, repeated: true }
      if (draft.status !== 'draft' || draft.version !== expectedVersion) throw new KernelError('STALE_DRAFT', 'This draft changed. Reopen it before publishing.', 409)
      const app = validateApplication(draft.definition)
      const slug = draft.baseProjectVersion ? draft.projectSlug! : `app-${draft.id}`
      const entities = namespaceApplication(app, slug)
      if (draft.baseProjectVersion) {
        const receipt = draft.preview as (MigrationPreview & { fingerprint: string }) | null
        if (!receipt || !previewToken || receipt.token !== previewToken || receipt.draftVersion !== expectedVersion) throw new KernelError('PREVIEW_REQUIRED', 'Preview the saved changes before publishing.', 409)
        const state = await this.applicationState(tx, p, slug)
        if (state.project.version !== draft.baseProjectVersion) throw new KernelError('STALE_PROJECT', 'A newer application version exists. Start a new change draft from Configure.', 409)
        if (receipt.fingerprint !== state.fingerprint) throw new KernelError('STALE_PREVIEW', 'Records or proposals changed after your preview. Preview the changes again before publishing.', 409)
        const plan = planMigration(state.app, app, slug, state.records, state.pending)
        if (!plan.report.canPublish) throw new KernelError('MIGRATION_BLOCKED', 'Resolve the issues in the migration preview before publishing.', 409)
        const version = state.project.version + 1
        const changedProject = await tx.project.updateMany({ where: { id: state.project.id, version: state.project.version }, data: { name: app.name, description: app.description, definition: json(app), assembly: draft.assembly == null ? Prisma.DbNull : json(draft.assembly), packages: json(entities.map(e => e.slug)), version } })
        if (changedProject.count !== 1) throw new KernelError('STALE_PROJECT', 'The application changed during publication.', 409)
        for (const entity of entities) {
          const existing = state.capabilities.find(c => c.slug === entity.slug)
          if (!existing) {
            await tx.capability.create({ data: { workspaceId: p.workspaceId, slug: entity.slug, definition: json(entity), versions: { create: { version: 1, definition: json(entity), publishedBy: p.userId } } } })
          } else if (plan.changedCapabilities.includes(entity.slug)) {
            const changed = await tx.capability.updateMany({ where: { id: existing.id, version: existing.version }, data: { definition: json(entity), version: { increment: 1 } } })
            if (changed.count !== 1) throw new KernelError('STALE_DEFINITION', 'An entity definition changed during publication.', 409)
            await tx.capabilityVersion.create({ data: { capabilityId: existing.id, version: existing.version + 1, definition: json(entity), publishedBy: p.userId } })
          }
        }
        for (const update of plan.updates) {
          const changed = await tx.businessRecord.updateMany({ where: { id: update.id, workspaceId: p.workspaceId, version: update.version }, data: { data: json(update.data), version: { increment: 1 } } })
          if (changed.count !== 1) throw new KernelError('STALE_PREVIEW', 'A record changed during publication. Preview again.', 409)
        }
        for (const capability of plan.removedCapabilities) {
          await tx.changeSet.updateMany({ where: { workspaceId: p.workspaceId, capability, status: 'pending' }, data: { status: 'rejected', reviewedBy: p.userId, reviewedAt: new Date() } })
          await tx.businessRecord.deleteMany({ where: { workspaceId: p.workspaceId, capability } })
          await tx.capability.deleteMany({ where: { workspaceId: p.workspaceId, slug: capability } })
        }
        await tx.projectVersion.create({ data: { projectId: state.project.id, version, definition: json(app), migration: json(plan.report), publishedBy: p.userId } })
        const changedDraft = await tx.projectDraft.updateMany({ where: { id, workspaceId: p.workspaceId, status: 'draft', version: expectedVersion }, data: { status: 'published', publishedVersion: expectedVersion } })
        if (changedDraft.count !== 1) throw new KernelError('STALE_DRAFT', 'The draft changed during publication.', 409)
        await this.event(tx, p, 'project.publish', 'applied', { projectSlug: slug, draftId: id, draftVersion: expectedVersion, fromVersion: state.project.version, toVersion: version, updatedRecords: plan.updates.length, deletedRecords: plan.deletions.length, removedValues: plan.report.removedValueCount, removedEntities: plan.removedCapabilities, invalidatedProposals: plan.report.invalidatedProposals })
        return { slug, version, repeated: false }
      }
      const changed = await tx.projectDraft.updateMany({ where: { id, workspaceId: p.workspaceId, status: 'draft', version: expectedVersion }, data: { status: 'published', projectSlug: slug, publishedVersion: expectedVersion } })
      if (changed.count !== 1) throw new KernelError('STALE_DRAFT', 'This draft changed during publication.', 409)
      await tx.project.create({ data: { workspaceId: p.workspaceId, slug, name: app.name, description: app.description, definition: json(app), assembly: draft.assembly == null ? Prisma.DbNull : json(draft.assembly), shell: 'workbench', packages: json(entities.map(e => e.slug)), versions: { create: { version: 1, definition: json(app), migration: { kind: 'initial' }, publishedBy: p.userId } } } })
      for (const entity of entities) {
        await tx.capability.create({ data: { workspaceId: p.workspaceId, slug: entity.slug, definition: json(entity), versions: { create: { version: 1, definition: json(entity), publishedBy: p.userId } } } })
      }
      await this.event(tx, p, 'project.publish', 'applied', { projectSlug: slug, draftId: id, draftVersion: expectedVersion, toVersion: 1, entities: entities.map(e => e.slug) })
      return { slug, version: 1, repeated: false }
    })
  }

  async publicSite(workspaceId: string) {
    const workspace = await this.db.workspace.findUnique({ where: { id: workspaceId } })
    const siteProject = workspace && sortProjects((await this.db.project.findMany({ where: { workspaceId } })).map(toProjectSnapshot)).find(item => item.shell === 'site')
    if (!workspace || !siteProject) throw new KernelError('NOT_FOUND', 'Public site not found.', 404)
    const installed = catalogFor(siteProject.packages)
    const records = await this.db.businessRecord.findMany({
      where: { workspaceId, capability: { in: installed.filter(item => item.view !== 'none').map(item => item.definition.slug) }, data: { path: ['status'], equals: 'published' } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      workspace: { id: workspace.id, name: workspace.name },
      example: true,
      blocks: composePublic(records.map(record => ({
        id: record.id, capability: record.capability, data: record.data as RecordData, createdAt: record.createdAt,
      })), installed),
    }
  }

  async createRecord(p: Principal, raw: unknown, slug: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (!['owner', 'operator', 'application'].includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot create records.', 403)
      await this.assertApplicationCapability(tx, p, slug)
      const cap = await this.capability(tx, p.workspaceId, slug)
      const data = validateFields(cap.definition.entity.fields, raw, true)
      await this.validateReferences(tx, p, cap.definition.entity.fields, data, cap.slug)
      const record = await tx.businessRecord.create({ data: { workspaceId: p.workspaceId, capability: cap.slug, entity: cap.definition.entity.name, data: json(data) } })
      await this.event(tx, p, 'record.create', 'applied', { title: data.title, capability: cap.slug, version: 1 }, record.id)
      return record
    })
  }

  async stageCreate(p: Principal, raw: unknown) {
    const command = createProposalSchema.parse(raw)
    const execute = () => this.db.$transaction(tx => this.stageCreateTx(tx, p, command))
    try { return await execute() }
    catch (error) {
      // A simultaneous retry can lose the unique-key race; reload the winning proposal.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return execute()
      throw error
    }
  }

  private async stageCreateTx(tx: Tx, p: Principal, command: z.infer<typeof createProposalSchema>, executionMode: 'review' | 'automatic' = 'review') {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('AGENT_SCOPE', 'Use a scoped operate credential to propose record creation.', 403)
      const cap = await this.capability(tx, p.workspaceId, command.capability)
      await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, CREATE_ACTION, cap.version)
      let values: ReturnType<typeof creationValues>
      try { values = creationValues(cap.definition, command.input) }
      catch (error) { throw inputFailure(error, 'INVALID_INPUT', 422) }
      await this.validateReferences(tx, p, cap.definition.entity.fields, values.after, cap.slug)
      if (p.agentCredentialId) await lockCredential(tx, p.agentCredentialId)
      const existing = await tx.changeSet.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: p.workspaceId, idempotencyKey: command.idempotencyKey } } })
      if (existing) {
        if (existing.executionMode !== executionMode || existing.kind !== 'create' || existing.capability !== cap.slug || existing.proposedBy !== p.userId || existing.agentCredentialId !== p.agentCredentialId || existing.actorKind !== p.kind || canonical(existing.input) !== canonical(values.input)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key was already used for a different proposal.', 409)
        return { status: existing.status, change: existing, checks: existing.checks }
      }
      await admitOperation(tx, p.agentCredentialId)
      const checks = [{ id: 'create', label: 'Creation fields and relationships', passed: true, message: executionMode === 'automatic' ? 'Validated against the published definition; owner-authorized automatic execution.' : 'Validated against the published definition; human review required.' }]
      const change = await tx.changeSet.create({ data: {
        kind: 'create', executionMode, workspaceId: p.workspaceId, capability: cap.slug, definitionVersion: cap.version,
        recordId: randomUUID(), recordVersion: 0, action: CREATE_ACTION,
        input: json(values.input), before: {}, after: json(values.after), checks: json(checks),
        proposedBy: p.userId, actorKind: p.kind, agentCredentialId: p.agentCredentialId, idempotencyKey: command.idempotencyKey,
      } })
      await this.event(tx, p, `${cap.slug}.${CREATE_ACTION}`, 'staged', { title: values.after.title, kind: 'create', executionMode, definitionVersion: cap.version }, change.recordId, change.id)
      return { status: 'staged', change, checks }
  }

  async executeAgent(p: Principal, raw: unknown) {
    const command = agentExecutionSchema.parse(raw)
    const execute = () => this.db.$transaction(async tx => {
      return this.executeAgentTx(tx, p, command)
    })
    try { return await execute() }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return execute()
      throw error
    }
  }

  private async executeAgentTx(tx: Tx, p: Principal, command: z.infer<typeof agentExecutionSchema>) {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('AGENT_SCOPE', 'Automatic execution requires a scoped credential.', 403)
      const cap = await this.capability(tx, p.workspaceId, command.capability)
      const action = command.operation === 'create' ? CREATE_ACTION : command.action
      const access = await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, action, cap.version)
      if (access.scope.execution !== 'automatic') throw new KernelError('AGENT_SCOPE', 'Human review is required for this operation.', 403)
      const staged = command.operation === 'create'
        ? await this.stageCreateTx(tx, p, command, 'automatic')
        : await this.stageTx(tx, p, command, 'automatic')
      if (!staged.change || staged.change.status !== 'pending') return staged
      const applied = await this.resolveChange(tx, p, staged.change.id, 'apply', true)
      return { ...applied, checks: staged.checks }
  }

  async startAgentRun(p: Principal, raw: unknown) {
    const command = agentRunSchema.parse(raw)
    for (const [index, step] of command.steps.entries()) {
      if (step.operation === 'action' && typeof step.record !== 'string' && step.record.step >= index) {
        throw new KernelError('INVALID_INPUT', 'Record references must point to an earlier step.', 400)
      }
    }
    const start = () => this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('AGENT_SCOPE', 'Runs require a scoped operate credential.', 403)
      for (const step of command.steps) {
        const cap = await this.capability(tx, p.workspaceId, step.capability)
        const access = await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, step.operation === 'create' ? CREATE_ACTION : step.action, cap.version)
        if (step.execution === 'automatic' && access.scope.execution !== 'automatic') throw new KernelError('AGENT_SCOPE', 'Human review is required for this operation.', 403)
      }
      await lockCredential(tx, p.agentCredentialId)
      const existing = await tx.agentRun.findUnique({ where: { agentCredentialId_idempotencyKey: { agentCredentialId: p.agentCredentialId, idempotencyKey: command.idempotencyKey } } })
      if (existing) {
        if (canonical(existing.steps) !== canonical(command.steps)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key already identifies a different run.', 409)
        return existing
      }
      await admitRun(tx, p.agentCredentialId)
      const run = await tx.agentRun.create({ data: { workspaceId: p.workspaceId, agentCredentialId: p.agentCredentialId, idempotencyKey: command.idempotencyKey, steps: json(command.steps) } })
      await this.event(tx, p, 'run.start', 'queued', { runId: run.id, steps: command.steps.length })
      return run
    })
    try { return await start() } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return start()
      throw error
    }
  }

  async agentRun(p: Principal, raw: unknown): Promise<import('./run-inspection.server').InspectedRun> {
    const command = agentRunCommandSchema.parse(raw)
    const run = await this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId && (p.kind !== 'human' || p.role !== 'owner')) throw new KernelError('FORBIDDEN', 'Only the credential or workspace owner can manage this run.', 403)
      const run = await tx.agentRun.findFirst({ where: { id: command.runId, workspaceId: p.workspaceId, ...(p.agentCredentialId ? { agentCredentialId: p.agentCredentialId } : {}) } })
      if (!run) throw new KernelError('NOT_FOUND', 'Run not found.', 404)
      if (command.command === 'cancel' && ['queued', 'waiting', 'failed'].includes(run.status)) {
        const claimed = await tx.agentRun.updateMany({ where: { id: run.id, revision: run.revision }, data: { status: 'cancelled', revision: { increment: 1 } } })
        if (!claimed.count) throw new KernelError('CONFLICT', 'Run changed; retry cancellation.', 409)
        const receipts = run.receipts as RunReceipt[]
        await tx.changeSet.updateMany({ where: { id: { in: receipts.map(r => r.changeId) }, workspaceId: run.workspaceId, agentCredentialId: run.agentCredentialId, status: 'pending' }, data: { status: 'rejected' } })
        await this.event(tx, p, 'run.cancel', 'cancelled', { runId: run.id })
      }
      if (command.command === 'retry' && run.status === 'failed') {
        if (Date.now() - run.createdAt.getTime() >= agentLimits.runLifetimeMs) throw new KernelError('RUN_EXPIRED', 'This run exceeded seven days. Cancel it and start a revised task.', 409)
        await admitRun(tx, run.agentCredentialId)
        if (!runRecovery(run.status, run.error).canRetry) throw new KernelError('RUN_REPLAN_REQUIRED', runRecovery(run.status, run.error).message, 409)
        const changed = await tx.agentRun.updateMany({ where: { id: run.id, revision: run.revision }, data: { status: 'queued', error: Prisma.DbNull, revision: { increment: 1 } } })
        if (!changed.count) throw new KernelError('CONFLICT', 'Run changed; retry the request.', 409)
        await this.event(tx, p, 'run.retry', 'queued', { runId: run.id })
      }
      return inspectRun(tx, await tx.agentRun.findUniqueOrThrow({ where: { id: run.id } }))
    })
    if (command.command === 'advance') {
      await this.advanceAgentRun(run.id)
      return this.agentRun(p, { runId: run.id })
    }
    return run
  }

  async pollAgentRuns() {
    try {
      const result = await this.advanceAgentRun()
      await this.db.agentWorkerHealth.upsert({ where: { id: 'operations' }, create: { id: 'operations', lastSuccessAt: new Date() }, update: { lastSuccessAt: new Date() } })
      return result
    } catch (error) {
      await this.db.agentWorkerHealth.upsert({ where: { id: 'operations' }, create: { id: 'operations', lastFailureAt: new Date() }, update: { lastFailureAt: new Date() } })
      throw error
    }
  }

  async agentWorkerHealth(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only workspace owners can inspect worker health.', 403)
      const health = await tx.agentWorkerHealth.findUnique({ where: { id: 'operations' } })
      const healthy = Boolean(health?.lastSuccessAt && Date.now() - health.lastSuccessAt.getTime() < agentLimits.stalledMs)
      const stalled = await tx.agentRun.count({ where: { workspaceId: p.workspaceId, status: 'queued', updatedAt: { lt: new Date(Date.now() - agentLimits.stalledMs) } } })
      return { status: healthy ? (health?.lastFailureAt && health.lastFailureAt > health.lastSuccessAt! ? 'degraded' : 'healthy') : 'unavailable', lastSuccessAt: health?.lastSuccessAt ?? null, lastFailureAt: health?.lastFailureAt ?? null, stalled, limits: agentLimits }
    })
  }

  /** One bounded, database-only step. The revision lock, effect and checkpoint
   * commit together; a crash rolls everything back for the next worker. */
  async advanceAgentRun(runId?: string): Promise<boolean> {
    const candidate = await this.db.agentRun.findFirst({ where: { ...(runId ? { id: runId } : {}), status: { in: ['queued', 'waiting'] } }, orderBy: { updatedAt: 'asc' } })
    if (!candidate) return false
    try {
      return await this.db.$transaction(async tx => {
        const claimed = await tx.agentRun.updateMany({ where: { id: candidate.id, revision: candidate.revision, status: candidate.status }, data: { revision: { increment: 1 } } })
        if (!claimed.count) return false
        if (Date.now() - candidate.createdAt.getTime() >= agentLimits.runLifetimeMs) {
          await tx.changeSet.updateMany({ where: { workspaceId: candidate.workspaceId, agentCredentialId: candidate.agentCredentialId, id: { in: (candidate.receipts as RunReceipt[]).map(r => r.changeId) }, status: 'pending' }, data: { status: 'rejected' } })
          await tx.agentRun.update({ where: { id: candidate.id }, data: { status: 'failed', error: { code: 'RUN_EXPIRED', message: 'Run exceeded seven days. Applied changes remain; pending proposals were rejected. Start a revised task.' } } })
          await tx.execution.create({ data: { workspaceId: candidate.workspaceId, actorId: 'agent-run-worker', actorName: 'Run worker', actorKind: 'system', action: 'run.expire', outcome: 'failed', details: { runId: candidate.id } } })
          return true
        }
        const { p } = await resolveAgent(tx, candidate.agentCredentialId)
        if (p.workspaceId !== candidate.workspaceId || p.agentGrant !== 'operate') throw new KernelError('AGENT_SCOPE', 'Run credential is no longer valid.', 403)
        const receipts = candidate.receipts as RunReceipt[]
        const steps = agentRunSchema.shape.steps.parse(candidate.steps)
        let receipt = receipts[candidate.nextStep]
        if (!receipt) {
          const step = steps[candidate.nextStep]
          const base = { capability: step.capability, input: step.input, idempotencyKey: `run:${candidate.id}:${candidate.nextStep}` }
          const command = step.operation === 'create' ? { ...base, operation: 'create' as const } : {
            ...base, operation: 'action' as const, action: step.action,
            recordId: typeof step.record === 'string' ? step.record : receipts[step.record.step].recordId,
          }
          const result = step.execution === 'automatic' ? await this.executeAgentTx(tx, p, command)
            : command.operation === 'create' ? await this.stageCreateTx(tx, p, command) : await this.stageTx(tx, p, command)
          if (!result.change) throw new KernelError('POLICY_BLOCKED', 'Step blocked by application policy.', 422, result.checks)
          receipt = { changeId: result.change.id, recordId: result.change.recordId }
          receipts.push(receipt)
        }
        const change = await tx.changeSet.findUniqueOrThrow({ where: { id: receipt.changeId } })
        const nextStep = candidate.nextStep + (change.status === 'applied' ? 1 : 0)
        const status = change.status === 'rejected' ? 'failed' : change.status === 'pending' ? 'waiting' : nextStep === steps.length ? 'completed' : 'queued'
        await tx.agentRun.update({ where: { id: candidate.id }, data: { receipts: json(receipts), nextStep, status,
          error: status === 'failed' ? { code: 'PROPOSAL_REJECTED', message: 'A run proposal was rejected; create a new run with revised steps.' } : Prisma.DbNull,
        } })
        if (status !== 'waiting' || candidate.status !== 'waiting') await this.event(tx, p, 'run.step', status, { runId: candidate.id, step: candidate.nextStep, changeId: receipt.changeId })
        return true
      })
    } catch (error) {
      if (error instanceof KernelError && error.code === 'OPERATION_RATE_LIMIT') {
        await this.db.agentRun.updateMany({ where: { id: candidate.id, revision: candidate.revision, status: candidate.status }, data: { updatedAt: new Date(), error: { code: error.code, message: error.message } } })
        return false
      }
      // The effect transaction rolled back. Never overwrite a newer checkpoint or cancellation.
      const failure = error instanceof KernelError ? { code: error.code, message: error.message } : { code: 'STEP_FAILED', message: 'Step failed without committing. Retry after resolving the cause.' }
      await this.db.agentRun.updateMany({ where: { id: candidate.id, revision: candidate.revision, status: candidate.status }, data: { status: 'failed', error: failure, revision: { increment: 1 } } })
      return true
    }
  }

  async queryRecords(p: Principal, raw: unknown) {
    const query = recordQuerySchema.parse(raw)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('AGENT_SCOPE', 'Use a scoped operate credential to query records.', 403)
      const access = await resolveAgent(tx, p.agentCredentialId)
      if (!access.project || !asStringList(access.project.packages).includes(query.capability)) throw new KernelError('AGENT_SCOPE', 'Choose an entity in this application.', 403)
      const cap = await this.capability(tx, p.workspaceId, query.capability)
      const savedView = query.viewId ? toProjectSnapshot(access.project).presentation?.views.find(view => view.id === query.viewId && view.entity === cap.slug) : undefined
      if (query.viewId && !savedView) throw new KernelError('INVALID_INPUT', 'Choose a saved view for this entity.')
      const now = new Date()
      const predicates: Prisma.BusinessRecordWhereInput[] = []
      for (const filter of query.filters) {
        const field = Object.hasOwn(cap.definition.entity.fields, filter.field) ? cap.definition.entity.fields[filter.field] : undefined
        if (!field) throw new KernelError('INVALID_INPUT', `Unknown filter field: ${filter.field}`)
        let value
        try { value = validateFields({ [filter.field]: field }, { [filter.field]: filter.value })[filter.field] }
        catch (error) { throw inputFailure(error, 'INVALID_INPUT') }
        predicates.push({ data: { path: [filter.field], equals: value } })
      }
      if (query.title) predicates.push({ data: { path: ['title'], string_contains: query.title } })
      const fingerprint = createHash('sha256').update(canonical({ credential: p.agentCredentialId, capability: query.capability, version: cap.version, filters: query.filters, title: query.title ?? null, ...(savedView ? { savedView, today: calendarDate(now, savedView.timeZone) } : {}) })).digest('hex')
      let after: string | undefined
      if (query.cursor) {
        try {
          const cursor = z.object({ after: z.string().min(1).max(100), query: z.literal(fingerprint) }).strict().parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()))
          after = cursor.after
        } catch { throw new KernelError('INVALID_INPUT', 'Cursor does not match this query or definition. Start a fresh query.') }
      }
      if (savedView) {
        // Bound each page's scan. A sparse page may be empty with a continuation cursor.
        const candidates = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: cap.slug, ...(after ? { id: { gt: after } } : {}), AND: predicates }, orderBy: { id: 'asc' }, take: 1001 })
        const records: typeof candidates = []
        let scanned = 0
        for (const record of candidates.slice(0, 1000)) {
          scanned++
          if (matchesView(record.data as RecordData, savedView, { now, userId: p.userId, updatedAt: record.updatedAt })) records.push(record)
          if (records.length === query.limit) break
        }
        return { capability: cap.slug, definitionVersion: cap.version, records, scanned, nextCursor: scanned < candidates.length ? Buffer.from(JSON.stringify({ after: candidates[scanned - 1].id, query: fingerprint })).toString('base64url') : null }
      }
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: cap.slug, ...(after ? { id: { gt: after } } : {}), AND: predicates }, orderBy: { id: 'asc' }, take: query.limit + 1 })
      return { capability: cap.slug, definitionVersion: cap.version, records: records.slice(0, query.limit), nextCursor: records.length > query.limit ? Buffer.from(JSON.stringify({ after: records[query.limit - 1].id, query: fingerprint })).toString('base64url') : null }
    })
  }

  async agentProposal(p: Principal, id: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('FORBIDDEN', 'Agent credential required.', 403)
      const change = await tx.changeSet.findFirst({ where: { id, workspaceId: p.workspaceId, agentCredentialId: p.agentCredentialId } })
      if (!change) throw new KernelError('NOT_FOUND', 'Proposal not found.', 404)
      return { change }
    })
  }

  async agentSnapshot(p: Principal, cursor?: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      if (!p.agentCredentialId) throw new KernelError('FORBIDDEN', 'Agent credential required.', 403)
      const access = await resolveAgent(tx, p.agentCredentialId)
      if (!access.project) throw new KernelError('FORBIDDEN', 'This credential creates applications over MCP; it cannot read records.', 403)
      const packages = toProjectSnapshot(access.project).packages
      const caps = await tx.capability.findMany({ where: { workspaceId: p.workspaceId, slug: { in: packages } }, orderBy: { slug: 'asc' } })
      const capabilities = caps.map(cap => {
        const definition = definitionSchema.parse(cap.definition)
        const actions = definition.actions.filter(action => action.roles.includes('operator') && access.actions.some(scope => scope.capability === cap.slug && scope.action === action.name && scope.version === cap.version))
        return { slug: cap.slug, version: cap.version, entity: definition.entity, creation: access.actions.some(scope => scope.capability === cap.slug && scope.action === CREATE_ACTION && scope.version === cap.version) ? { inputSchema: creationContract(definition), execution: access.actions.find(scope => scope.capability === cap.slug && scope.action === CREATE_ACTION)?.execution ?? 'review' } : null, tools: toolContracts({ ...definition, actions }).map(tool => {
          const { recordId, idempotencyKey, ...properties } = tool.inputSchema.properties
          const action = tool.name.slice(cap.slug.length + 1)
          return { ...tool, execution: access.actions.find(scope => scope.capability === cap.slug && scope.action === action)?.execution ?? 'review', inputSchema: { type: 'object', additionalProperties: false, required: ['type', 'recordId', 'action', 'input', 'idempotencyKey'], properties: {
            type: { type: 'string', const: 'stage' }, recordId, action: { type: 'string', const: action }, idempotencyKey,
            input: { type: 'object', additionalProperties: false, properties, required: tool.inputSchema.required.filter(key => !['recordId', 'idempotencyKey'].includes(key)) },
          } } }
        }) }
      })
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: { in: packages }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 101 })
      const staleActions = access.actions.filter(scope => !caps.some(cap => cap.slug === scope.capability && cap.version === scope.version))
      return { project: { slug: access.project.slug, name: access.project.name, version: access.project.version }, capabilities, members: await this.assignmentMembers(tx, p, access.project.slug), views: toProjectSnapshot(access.project).presentation?.views ?? [], currentUserId: p.userId, records: records.slice(0, 100), nextCursor: records.length > 100 ? records[99].id : null, staleActions, mode: 'Scoped operator access. Review is the default; only explicitly granted automatic operations may apply without review.' }
    })
  }

  /** Human execution is explicit per action. Agent grants never inherit this permission. */
  async act(p: Principal, command: { recordId: string; action: string; input: unknown; expectedVersion: number; definitionVersion: number }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Direct actions require a human session.', 403)
      const record = await tx.businessRecord.findFirst({ where: { id: command.recordId, workspaceId: p.workspaceId } })
      if (!record) throw new KernelError('NOT_FOUND', 'Record not found.', 404)
      await this.assertApplicationCapability(tx, p, record.capability)
      const cap = await this.capability(tx, p.workspaceId, record.capability)
      if (cap.version !== command.definitionVersion || record.version !== command.expectedVersion) throw new KernelError('STALE_RECORD', 'This record or its definition changed. Refresh before saving.', 409)
      if (cap.definition.actions.find(action => action.name === command.action)?.humanExecution !== 'direct') throw new KernelError('HUMAN_APPROVAL_REQUIRED', 'This action requires a reviewed proposal.', 403)
      const result = evaluate(cap.definition, command.action, record.data as RecordData, command.input, recordRole(p.role))
      if (!result.allowed) throw new KernelError('POLICY_BLOCKED', result.checks.find(check => !check.passed)?.message ?? 'Action blocked.', 403)
      await this.validateReferences(tx, p, cap.definition.entity.fields, result.after, cap.slug, record.id)
      const updated = await tx.businessRecord.updateMany({ where: { id: record.id, workspaceId: p.workspaceId, version: command.expectedVersion }, data: { data: json(result.after), version: { increment: 1 } } })
      if (updated.count !== 1) throw new KernelError('STALE_RECORD', 'Another update was saved. Refresh before saving.', 409)
      await this.event(tx, p, `${cap.slug}.${command.action}`, 'applied', { title: result.after.title, before: record.data, after: result.after, definitionVersion: cap.version, recordVersion: record.version + 1, executionMode: 'human' }, record.id)
      return { status: 'applied', checks: result.checks }
    })
  }

  async stage(p: Principal, command: { recordId: string; action: string; input: unknown; idempotencyKey: string; capability?: string }) {
    return this.db.$transaction(tx => this.stageTx(tx, p, command))
  }

  private async stageTx(tx: Tx, p: Principal, command: Parameters<Kernel['stage']>[1], executionMode: 'review' | 'automatic' = 'review') {
      await this.authorize(tx, p, 'operate')
      const record = await tx.businessRecord.findFirst({ where: { id: command.recordId, workspaceId: p.workspaceId } })
      if (!record) throw new KernelError('NOT_FOUND', 'Record not found.', 404)
      if (command.capability && record.capability !== command.capability) throw new KernelError('AGENT_SCOPE', 'This record does not belong to the selected action’s entity.', 403)
      const cap = await this.capability(tx, p.workspaceId, record.capability)
      if (p.agentCredentialId) await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, command.action, cap.version)
      await this.assertApplicationCapability(tx, p, cap.slug)
      const result = evaluate(cap.definition, command.action, record.data as RecordData, command.input, recordRole(p.role))
      await this.validateReferences(tx, p, cap.definition.entity.fields, result.after, cap.slug, record.id)
      if (p.agentCredentialId) await lockCredential(tx, p.agentCredentialId)
      const existing = await tx.changeSet.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: p.workspaceId, idempotencyKey: command.idempotencyKey } } })
      if (existing) {
        if (existing.executionMode !== executionMode || existing.recordId !== record.id || existing.action !== command.action || existing.proposedBy !== p.userId || existing.actorKind !== p.kind || existing.agentCredentialId !== (p.agentCredentialId ?? null) || JSON.stringify(existing.input) !== JSON.stringify(result.input)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key was already used for a different proposal.', 409)
        return { status: existing.status, change: existing, checks: existing.checks }
      }
      if (!result.allowed) {
        await this.event(tx, p, `${cap.slug}.${command.action}`, 'blocked', { title: (record.data as RecordData).title, executionMode, checks: result.checks }, record.id)
        return { status: 'blocked', change: null, checks: result.checks }
      }
      if (p.agentCredentialId) await admitOperation(tx, p.agentCredentialId)
      const change = await tx.changeSet.create({ data: {
        executionMode, workspaceId: p.workspaceId, capability: cap.slug, definitionVersion: cap.version,
        recordId: record.id, recordVersion: record.version, action: command.action,
        input: json(result.input), before: record.data!, after: json(result.after), checks: json(result.checks),
        proposedBy: p.userId, actorKind: p.kind, agentCredentialId: p.agentCredentialId, idempotencyKey: command.idempotencyKey,
      } })
      await this.event(tx, p, `${cap.slug}.${command.action}`, 'staged', { title: (record.data as RecordData).title, executionMode, definitionVersion: cap.version, recordVersion: record.version }, record.id, change.id)
      return { status: 'staged', change, checks: result.checks }
  }

  async review(p: Principal, changeId: string, decision: 'apply' | 'reject') {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('HUMAN_APPROVAL_REQUIRED', 'Only the authenticated human review surface can apply or reject a proposal.', 403)
      return this.resolveChange(tx, p, changeId, decision)
    })
  }

  private async resolveChange(tx: Tx, p: Principal, changeId: string, decision: 'apply' | 'reject', automatic = false) {
      const change = await tx.changeSet.findFirst({ where: { id: changeId, workspaceId: p.workspaceId } })
      if (!change) throw new KernelError('NOT_FOUND', 'Proposal not found.', 404)
      if (decision === 'apply' && change.status === 'pending' && change.idempotencyKey.startsWith('run:')) {
        const run = await tx.agentRun.findFirst({ where: { id: change.idempotencyKey.split(':')[1], workspaceId: p.workspaceId } })
        if (run && (run.receipts as RunReceipt[]).some(r => r.changeId === change.id) && Date.now() - run.createdAt.getTime() >= agentLimits.runLifetimeMs) throw new KernelError('RUN_EXPIRED', 'The run deadline passed. Cancel the run and start a revised task.', 409)
      }
      const cap = await this.capability(tx, p.workspaceId, change.capability)
      if (automatic) {
        if (!p.agentCredentialId || change.agentCredentialId !== p.agentCredentialId || change.executionMode !== 'automatic' || decision !== 'apply') throw new KernelError('AGENT_SCOPE', 'This operation cannot run automatically.', 403)
        const access = await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, change.action, cap.version)
        if (access.scope.execution !== 'automatic') throw new KernelError('AGENT_SCOPE', 'Human review is required for this operation.', 403)
      }
      if (!automatic && !cap.definition.reviewerRoles.includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot review proposals.', 403)
      if (change.status === 'applied' && decision === 'apply' || change.status === 'rejected' && decision === 'reject') return { status: change.status, change, repeated: true }
      if (change.status !== 'pending') throw new KernelError('CONFLICT', 'This proposal has already been resolved.', 409)
      const status = decision === 'apply' ? 'applied' : 'rejected'
      const claimed = await tx.changeSet.updateMany({ where: { id: change.id, workspaceId: p.workspaceId, status: 'pending' }, data: { status, reviewedBy: automatic ? null : p.userId, reviewedAt: automatic ? null : new Date() } })
      if (claimed.count !== 1) throw new KernelError('CONFLICT', 'Another reviewer resolved this proposal.', 409)
      if (decision === 'apply' && change.kind === 'create') {
        if (cap.version !== change.definitionVersion) throw new KernelError('STALE_PROPOSAL', 'The definition changed. Reject this proposal and stage a fresh one.', 409)
        if (!change.agentCredentialId) throw new KernelError('AGENT_SCOPE', 'Creation proposals require a scoped credential.', 403)
        await authorizeAgentAction(tx, change.agentCredentialId, cap.slug, CREATE_ACTION, cap.version)
        const values = creationValues(cap.definition, change.input)
        await this.validateReferences(tx, p, cap.definition.entity.fields, values.after, cap.slug)
        if (canonical(values.after) !== canonical(change.after)) throw new KernelError('CONFLICT', 'Creation fields no longer match the proposal.', 409)
        await tx.businessRecord.create({ data: { id: change.recordId, workspaceId: p.workspaceId, capability: cap.slug, entity: cap.definition.entity.name, data: json(values.after) } })
      } else if (decision === 'apply') {
        const record = await tx.businessRecord.findFirst({ where: { id: change.recordId, workspaceId: p.workspaceId } })
        if (!record || record.version !== change.recordVersion || cap.version !== change.definitionVersion) throw new KernelError('STALE_PROPOSAL', 'The record or capability has changed. Reject this proposal and stage a fresh one.', 409)
        const proposer = await effectiveMember(tx, p.workspaceId, change.proposedBy)
        if (!proposer) throw new KernelError('FORBIDDEN', 'The proposer no longer belongs to this workspace.', 403)
        const agentAccess = change.agentCredentialId ? await authorizeAgentAction(tx, change.agentCredentialId, cap.slug, change.action, cap.version) : undefined
        if (!agentAccess) await this.assertApplicationCapability(tx, { ...p, userId: proposer.userId, role: proposer.role }, cap.slug)
        const result = evaluate(cap.definition, change.action, record.data as RecordData, change.input, agentAccess ? agentAccess.p.role : recordRole(proposer.role))
        await this.validateReferences(tx, p, cap.definition.entity.fields, result.after, cap.slug, record.id)
        if (!result.allowed) throw new KernelError('POLICY_BLOCKED', 'The proposal no longer meets current business rules.', 409)
        if (JSON.stringify(result.after) !== JSON.stringify(change.after)) throw new KernelError('CONFLICT', 'The proposed effects do not match the current action.', 409)
        const updated = await tx.businessRecord.updateMany({ where: { id: record.id, workspaceId: p.workspaceId, version: change.recordVersion }, data: { data: json(result.after), version: { increment: 1 } } })
        if (updated.count !== 1) throw new KernelError('STALE_PROPOSAL', 'The record changed during review.', 409)
      }
      await this.event(tx, p, `${cap.slug}.${change.action}`, status, { title: ((change.kind === 'create' ? change.after : change.before) as RecordData).title, kind: change.kind, executionMode: change.executionMode, agentCredentialId: change.agentCredentialId, before: change.before, after: decision === 'apply' ? change.after : change.before, definitionVersion: cap.version }, change.recordId, change.id)
      return { status, change: await tx.changeSet.findUniqueOrThrow({ where: { id: change.id } }), repeated: false }
  }

  async publishSettings(p: Principal, command: { capability: string; expectedVersion: number; settings: unknown }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only the workspace owner can publish settings.', 403)
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${p.workspaceId} FOR UPDATE`
      const cap = await this.capability(tx, p.workspaceId, command.capability)
      const managed = (await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).find(project => project.definition && asStringList(project.packages).includes(cap.slug))
      if (managed) throw new KernelError('MANAGED_DEFINITION', 'Change this application through a reviewed draft. Settings are part of the published definition.', 409)
      let definition
      try { definition = applySettings(cap.definition, command.settings) }
      catch (error) { throw inputFailure(error, 'INVALID_SETTINGS') }
      const changed = await tx.capability.updateMany({ where: { id: cap.id, workspaceId: p.workspaceId, version: command.expectedVersion }, data: { definition: json(definition), version: { increment: 1 } } })
      if (changed.count !== 1) throw new KernelError('STALE_DEFINITION', 'A newer capability version exists. Refresh before publishing.', 409)
      await tx.capabilityVersion.create({ data: { capabilityId: cap.id, version: cap.version + 1, definition: json(definition), publishedBy: p.userId } })
      await this.event(tx, p, 'capability.publish', 'applied', { capability: cap.slug, fromVersion: cap.version, toVersion: cap.version + 1, before: cap.definition.settings, after: definition.settings })
      return { version: cap.version + 1, definition }
    })
  }
}
