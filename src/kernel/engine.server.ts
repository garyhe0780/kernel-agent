import { planningContentSchema, planBrief } from './builder-plan'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { applySettings, definitionSchema, evaluate, toolContracts, validateFields, type Principal, type RecordData } from './definition'
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

import { KernelError } from './errors'
export { KernelError } from './errors'
import { resolveAgent, authorizeAgentAction } from './agent-access.server'
type Tx = Prisma.TransactionClient
const zEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
const json = (value: unknown) => value as Prisma.InputJsonValue

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
    const membership = await tx.membership.findFirst({ where: { userId: principal.userId, workspaceId: principal.workspaceId } })
    if (!membership || membership.role !== principal.role) throw new KernelError('FORBIDDEN', 'You do not have access to this workspace.', 403)
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
      catch (error) { throw error instanceof KernelError ? error : new KernelError('INVALID_INPUT', error instanceof Error ? error.message : 'Unknown pattern.', 422) }
    }
    if (command.assembly !== undefined && command.assembly !== null) {
      try { return { assembly: validateAssembly(command.assembly), definition: compileAssembly(command.assembly) } }
      catch (error) { throw error instanceof KernelError ? error : new KernelError('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid assembly.', 422) }
    }
    if (command.definition === undefined) throw new KernelError('INVALID_INPUT', 'Provide a catalog pattern, an assembly of catalog modules, or a definition.', 400)
    return { assembly: null, definition: validateApplication(command.definition) }
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

  async workspaceMembership(user: { id: string; name: string }, workspaceId?: string) {
    if (!workspaceId) return this.ensureWorkspace(user)
    const member = await this.db.membership.findFirst({ where: { userId: user.id, workspaceId } })
    if (!member) throw new KernelError('FORBIDDEN', 'You do not have access to this workspace.', 403)
    return member
  }

  async listWorkspaces(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only signed-in people can manage workspaces.', 403)
      return tx.membership.findMany({ where: { userId: p.userId }, select: { role: true, workspace: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } })
    })
  }

  async createWorkspace(p: Principal, name: string) {
    const next = name.trim()
    if (!next || next.length > 80) throw new KernelError('INVALID_NAME', 'Use a workspace name from 1 to 80 characters.', 422)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('FORBIDDEN', 'Only signed-in people can create workspaces.', 403)
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
      if (members.some(m => m.user.email.toLowerCase() === address)) throw new KernelError('ALREADY_MEMBER', 'This person already belongs to this workspace.', 409)
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
    if (!await this.db.membership.findFirst({where:{workspaceId:invite.workspaceId,userId:invite.createdBy,role:'owner'}})) throw new KernelError('INVALID_INVITE', 'The inviter no longer has owner access. Ask an owner for a new invitation.', 403)
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
      if (!await tx.membership.findFirst({where:{workspaceId:invite.workspaceId,userId:invite.createdBy,role:'owner'}})) throw new KernelError('INVALID_INVITE', 'The inviter no longer has owner access. Ask an owner for a new invitation.', 403)
      const workspace = await tx.workspace.findUnique({ where: { id: invite.workspaceId } })
      if (!workspace) throw new KernelError('NOT_FOUND', 'Workspace no longer exists.', 404)
      const existing = await tx.membership.findFirst({ where: { workspaceId: invite.workspaceId, userId: p.userId } })
      if (!existing) await tx.membership.create({ data: { workspaceId: invite.workspaceId, userId: p.userId, role: invite.role } })
      await tx.workspaceInvitation.delete({ where: { id: invite.id } })
      await this.event(tx, { ...p, workspaceId: invite.workspaceId, role: existing?.role ?? invite.role }, 'member.join', 'applied', { userId: p.userId })
      return { workspaceId: invite.workspaceId, name: workspace.name }
    })
  }

  async updateMember(p: Principal, userId: string, expectedRole: string, role: 'owner' | 'operator' | 'remove') {
    if (!['owner', 'operator', 'remove'].includes(role) || !['owner', 'operator'].includes(expectedRole)) throw new KernelError('INVALID_ROLE', 'Choose owner or operator.', 422)
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only owners can manage members.', 403)
      if (userId === p.userId) throw new KernelError('SELF_CHANGE', 'Ask another owner to change your access.', 409)
      const where = { workspaceId: p.workspaceId, userId, role: expectedRole }
      const changed = role === 'remove' ? await tx.membership.deleteMany({ where }) : await tx.membership.updateMany({ where, data: { role } })
      if (!changed.count) throw new KernelError('CONFLICT', 'Membership changed. Refresh before trying again.', 409)
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
      const changes = await tx.changeSet.findMany({ where: { workspaceId: p.workspaceId, status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const projects = (await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).map(toProjectSnapshot)
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, id: { in: changes.map(change => change.recordId) } } })
      return changes.map(change => {
        const project = projects.find(item => item.packages.includes(change.capability))
        const record = records.find(item => item.id === change.recordId)
        const title = (record?.data as RecordData | undefined)?.title
        return { id: change.id, projectSlug: project?.slug ?? null, projectName: project?.name ?? 'Unavailable application', title: typeof title === 'string' ? title : 'Unavailable record', action: change.action, actorKind: change.actorKind, createdAt: change.createdAt, stale: !record || record.version !== change.recordVersion }
      })
    })
  }

  async snapshot(p: Principal, projectSlug?: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: p.workspaceId } })
      const projectRows = sortProjects(await tx.project.findMany({ where: { workspaceId: p.workspaceId } }))
      const projects = projectRows.map(toProjectSnapshot)
      const caps = await tx.capability.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { slug: 'asc' } })
      const allCapabilities = caps.map(cap => ({ ...cap, definition: definitionSchema.parse(cap.definition) }))
      const [allRecords, allChanges, allExecutions] = await Promise.all([
        tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' } }),
        Promise.all([
          tx.changeSet.findMany({ where: { workspaceId: p.workspaceId, status: 'pending' }, orderBy: { createdAt: 'desc' } }),
          tx.changeSet.findMany({ where: { workspaceId: p.workspaceId, status: { not: 'pending' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
        ]).then(([pending, history]) => [...pending, ...history].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
        tx.execution.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      ])
      const current = projectSlug ? projects.find(item => item.slug === projectSlug) : undefined
      if (projectSlug && !current) throw new KernelError('NOT_FOUND', 'Project not found.', 404)
      const slugs = current ? new Set(current.packages) : undefined
      const capabilities = current
        ? current.packages.map(slug => allCapabilities.find(cap => cap.slug === slug)).filter((cap): cap is typeof allCapabilities[number] => Boolean(cap))
        : allCapabilities
      const records = slugs ? allRecords.filter(record => slugs.has(record.capability)) : allRecords
      const recordIds = new Set(records.map(record => record.id))
      const scopedChanges = slugs ? allChanges.filter(change => slugs.has(change.capability)) : allChanges
      const [proposers, credentials] = await Promise.all([
        tx.user.findMany({ where: { id: { in: [...new Set(scopedChanges.map(change => change.proposedBy))] } }, select: { id: true, name: true } }),
        tx.agentCredential.findMany({ where: { workspaceId: p.workspaceId, id: { in: scopedChanges.flatMap(change => change.agentCredentialId ? [change.agentCredentialId] : []) } }, select: { id: true, name: true } }),
      ])
      const changes = scopedChanges.map(change => ({ ...change, proposerName: change.agentCredentialId ? credentials.find(item => item.id === change.agentCredentialId)?.name ?? 'Revoked agent' : `${proposers.find(item => item.id === change.proposedBy)?.name ?? 'Former member'}${change.actorKind === 'agent' ? ' · agent' : ''}` }))
      const executions = slugs ? allExecutions.filter(event => {
        if ((event.details as Record<string, unknown>).projectSlug === current?.slug) return true
        if (event.recordId) return recordIds.has(event.recordId)
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
      return { workspace, project: current, projects, capability, capabilities, records, changes, executions, tools, catalog: installed, principal: p }
    })
  }

  private async validateReferences(tx: Tx, p: Principal, fields: Record<string, import('./definition').Field>, data: RecordData) {
    for (const [key, field] of Object.entries(fields)) {
      if (!field.reference) continue
      if (data[key] === undefined || data[key] === '') {
        if (field.required) throw new KernelError('INVALID_REFERENCE', `Choose an existing ${field.label} in this project.`)
        continue
      }
      const target = await tx.businessRecord.findFirst({ where: { id: String(data[key]), workspaceId: p.workspaceId, capability: field.reference } })
      if (!target) throw new KernelError('INVALID_REFERENCE', `Choose an existing ${field.label} in this project.`)
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
        await tx.projectVersion.create({ data: { projectId: state.project.id, version, definition: json(app), migration: json(plan.report), publishedBy: p.userId } })
        const changedDraft = await tx.projectDraft.updateMany({ where: { id, workspaceId: p.workspaceId, status: 'draft', version: expectedVersion }, data: { status: 'published', publishedVersion: expectedVersion } })
        if (changedDraft.count !== 1) throw new KernelError('STALE_DRAFT', 'The draft changed during publication.', 409)
        await this.event(tx, p, 'project.publish', 'applied', { projectSlug: slug, draftId: id, draftVersion: expectedVersion, fromVersion: state.project.version, toVersion: version, updatedRecords: plan.updates.length, invalidatedProposals: plan.report.invalidatedProposals })
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
    if (!workspace) throw new KernelError('NOT_FOUND', 'Workspace not found.', 404)
    const [records, projectRows] = await Promise.all([
      this.db.businessRecord.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
      this.db.project.findMany({ where: { workspaceId } }),
    ])
    const siteProject = sortProjects(projectRows.map(toProjectSnapshot)).find(item => item.shell === 'site')
    const installed = siteProject ? catalogFor(siteProject.packages) : catalogFor(['site', 'blog'])
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
      if (!['owner', 'operator'].includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot create records.', 403)
      const cap = await this.capability(tx, p.workspaceId, slug)
      const data = validateFields(cap.definition.entity.fields, raw, true)
      await this.validateReferences(tx, p, cap.definition.entity.fields, data)
      const record = await tx.businessRecord.create({ data: { workspaceId: p.workspaceId, capability: cap.slug, entity: cap.definition.entity.name, data: json(data) } })
      await this.event(tx, p, 'record.create', 'applied', { title: data.title, capability: cap.slug, version: 1 }, record.id)
      return record
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
        return { slug: cap.slug, version: cap.version, entity: definition.entity, tools: toolContracts({ ...definition, actions }).map(tool => {
          const { recordId, idempotencyKey, ...properties } = tool.inputSchema.properties
          const action = tool.name.slice(cap.slug.length + 1)
          return { ...tool, inputSchema: { type: 'object', additionalProperties: false, required: ['type', 'recordId', 'action', 'input', 'idempotencyKey'], properties: {
            type: { type: 'string', const: 'stage' }, recordId, action: { type: 'string', const: action }, idempotencyKey,
            input: { type: 'object', additionalProperties: false, properties, required: tool.inputSchema.required.filter(key => !['recordId', 'idempotencyKey'].includes(key)) },
          } } }
        }) }
      })
      const records = await tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: { in: packages }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 101 })
      const staleActions = access.actions.filter(scope => !caps.some(cap => cap.slug === scope.capability && cap.version === scope.version))
      return { project: { slug: access.project.slug, name: access.project.name, version: access.project.version }, capabilities, records: records.slice(0, 100), nextCursor: records.length > 100 ? records[99].id : null, staleActions, mode: 'Read application records and stage selected actions as operator. Human review is required.' }
    })
  }

  async stage(p: Principal, command: { recordId: string; action: string; input: unknown; idempotencyKey: string; capability?: string }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p, 'operate')
      const record = await tx.businessRecord.findFirst({ where: { id: command.recordId, workspaceId: p.workspaceId } })
      if (!record) throw new KernelError('NOT_FOUND', 'Record not found.', 404)
      if (command.capability && record.capability !== command.capability) throw new KernelError('AGENT_SCOPE', 'This record does not belong to the selected action’s entity.', 403)
      const cap = await this.capability(tx, p.workspaceId, record.capability)
      if (p.agentCredentialId) await authorizeAgentAction(tx, p.agentCredentialId, cap.slug, command.action, cap.version)
      const result = evaluate(cap.definition, command.action, record.data as RecordData, command.input, p.role)
      await this.validateReferences(tx, p, cap.definition.entity.fields, result.after)
      const existing = await tx.changeSet.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: p.workspaceId, idempotencyKey: command.idempotencyKey } } })
      if (existing) {
        if (existing.recordId !== record.id || existing.action !== command.action || existing.proposedBy !== p.userId || existing.actorKind !== p.kind || existing.agentCredentialId !== (p.agentCredentialId ?? null) || JSON.stringify(existing.input) !== JSON.stringify(result.input)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key was already used for a different proposal.', 409)
        return { status: existing.status, change: existing, checks: existing.checks }
      }
      if (!result.allowed) {
        await this.event(tx, p, `${cap.slug}.${command.action}`, 'blocked', { title: (record.data as RecordData).title, checks: result.checks }, record.id)
        return { status: 'blocked', change: null, checks: result.checks }
      }
      const change = await tx.changeSet.create({ data: {
        workspaceId: p.workspaceId, capability: cap.slug, definitionVersion: cap.version,
        recordId: record.id, recordVersion: record.version, action: command.action,
        input: json(result.input), before: record.data!, after: json(result.after), checks: json(result.checks),
        proposedBy: p.userId, actorKind: p.kind, agentCredentialId: p.agentCredentialId, idempotencyKey: command.idempotencyKey,
      } })
      await this.event(tx, p, `${cap.slug}.${command.action}`, 'staged', { title: (record.data as RecordData).title, definitionVersion: cap.version, recordVersion: record.version }, record.id, change.id)
      return { status: 'staged', change, checks: result.checks }
    })
  }

  async review(p: Principal, changeId: string, decision: 'apply' | 'reject') {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human') throw new KernelError('HUMAN_APPROVAL_REQUIRED', 'Only the authenticated human review surface can apply or reject a proposal.', 403)
      const change = await tx.changeSet.findFirst({ where: { id: changeId, workspaceId: p.workspaceId } })
      if (!change) throw new KernelError('NOT_FOUND', 'Proposal not found.', 404)
      const cap = await this.capability(tx, p.workspaceId, change.capability)
      if (!cap.definition.reviewerRoles.includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot review proposals.', 403)
      if (change.status === 'applied' && decision === 'apply' || change.status === 'rejected' && decision === 'reject') return { status: change.status, change, repeated: true }
      if (change.status !== 'pending') throw new KernelError('CONFLICT', 'This proposal has already been resolved.', 409)
      if (decision === 'apply') {
        const record = await tx.businessRecord.findFirst({ where: { id: change.recordId, workspaceId: p.workspaceId } })
        if (!record || record.version !== change.recordVersion || cap.version !== change.definitionVersion) throw new KernelError('STALE_PROPOSAL', 'The record or capability has changed. Reject this proposal and stage a fresh one.', 409)
        const proposer = await tx.membership.findFirst({ where: { userId: change.proposedBy, workspaceId: p.workspaceId } })
        if (!proposer) throw new KernelError('FORBIDDEN', 'The proposer no longer belongs to this workspace.', 403)
        const agentAccess = change.agentCredentialId ? await authorizeAgentAction(tx, change.agentCredentialId, cap.slug, change.action, cap.version) : undefined
        const result = evaluate(cap.definition, change.action, record.data as RecordData, change.input, agentAccess ? agentAccess.p.role : proposer.role)
        await this.validateReferences(tx, p, cap.definition.entity.fields, result.after)
        if (!result.allowed) throw new KernelError('POLICY_BLOCKED', 'The proposal no longer meets current business rules.', 409)
        if (JSON.stringify(result.after) !== JSON.stringify(change.after)) throw new KernelError('CONFLICT', 'The proposed effects do not match the current action.', 409)
        const updated = await tx.businessRecord.updateMany({ where: { id: record.id, workspaceId: p.workspaceId, version: change.recordVersion }, data: { data: json(result.after), version: { increment: 1 } } })
        if (updated.count !== 1) throw new KernelError('STALE_PROPOSAL', 'The record changed during review.', 409)
      }
      const status = decision === 'apply' ? 'applied' : 'rejected'
      const updated = await tx.changeSet.updateMany({ where: { id: change.id, workspaceId: p.workspaceId, status: 'pending' }, data: { status, reviewedBy: p.userId, reviewedAt: new Date() } })
      if (updated.count !== 1) throw new KernelError('CONFLICT', 'Another reviewer resolved this proposal.', 409)
      await this.event(tx, p, `${cap.slug}.${change.action}`, status, { title: (change.before as RecordData).title, before: change.before, after: decision === 'apply' ? change.after : change.before, definitionVersion: cap.version }, change.recordId, change.id)
      return { status, change: await tx.changeSet.findUniqueOrThrow({ where: { id: change.id } }), repeated: false }
    })
  }

  async publishSettings(p: Principal, command: { capability: string; expectedVersion: number; settings: unknown }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only the workspace owner can publish settings.', 403)
      const cap = await this.capability(tx, p.workspaceId, command.capability)
      const managed = (await tx.project.findMany({ where: { workspaceId: p.workspaceId } })).find(project => project.definition && asStringList(project.packages).includes(cap.slug))
      if (managed) throw new KernelError('MANAGED_DEFINITION', 'Change this application through a reviewed draft. Settings are part of the published definition.', 409)
      let definition
      try { definition = applySettings(cap.definition, command.settings) }
      catch (error) { throw new KernelError('INVALID_SETTINGS', error instanceof Error ? error.message : 'Invalid settings.') }
      const changed = await tx.capability.updateMany({ where: { id: cap.id, workspaceId: p.workspaceId, version: command.expectedVersion }, data: { definition: json(definition), version: { increment: 1 } } })
      if (changed.count !== 1) throw new KernelError('STALE_DEFINITION', 'A newer capability version exists. Refresh before publishing.', 409)
      await tx.capabilityVersion.create({ data: { capabilityId: cap.id, version: cap.version + 1, definition: json(definition), publishedBy: p.userId } })
      await this.event(tx, p, 'capability.publish', 'applied', { capability: cap.slug, fromVersion: cap.version, toVersion: cap.version + 1, before: cap.definition.settings, after: definition.settings })
      return { version: cap.version + 1, definition }
    })
  }
}
