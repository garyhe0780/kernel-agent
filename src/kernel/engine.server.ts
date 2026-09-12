import { Prisma, PrismaClient } from '@prisma/client'
import { definitionSchema, evaluate, procurement, toolContracts, validateFields, type Principal, type RecordData } from './definition'
import { catalog, catalogFor, composePublic, seedFor } from './packages'
import { projectTemplates, sortProjects, toProjectSnapshot } from './projects'

export class KernelError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
type Tx = Prisma.TransactionClient
const json = (value: unknown) => value as Prisma.InputJsonValue

export class Kernel {
  constructor(private db: PrismaClient) {}

  private async authorize(tx: Tx, principal: Principal) {
    const membership = await tx.membership.findFirst({ where: { userId: principal.userId, workspaceId: principal.workspaceId } })
    if (!membership || membership.role !== principal.role) throw new KernelError('FORBIDDEN', 'You do not have access to this workspace.', 403)
  }

  private async capability(tx: Tx, workspaceId: string, slug = 'procurement') {
    const cap = await tx.capability.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } })
    if (!cap) throw new KernelError('NOT_FOUND', 'Capability not found.', 404)
    return { ...cap, definition: definitionSchema.parse(cap.definition) }
  }

  private async event(tx: Tx, p: Principal, action: string, outcome: string, details: unknown, recordId?: string, changeId?: string) {
    return tx.execution.create({ data: { workspaceId: p.workspaceId, actorId: p.userId, actorName: p.name, actorKind: p.kind, action, outcome, details: json(details), recordId, changeId } })
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

  private async bootstrap(tx: Tx, workspaceId: string, userId: string, workspaceName: string) {
    await this.installPackages(tx, workspaceId, userId, workspaceName)
    await this.installProjects(tx, workspaceId)
  }

  async ensureWorkspace(user: { id: string; name: string }) {
    const found = await this.db.membership.findUnique({ where: { userId: user.id } })
    if (found) {
      const workspace = await this.db.workspace.findUniqueOrThrow({ where: { id: found.workspaceId } })
      await this.db.$transaction(tx => this.bootstrap(tx, workspace.id, user.id, workspace.name))
      return found
    }
    try {
      return await this.db.$transaction(async tx => {
        const again = await tx.membership.findUnique({ where: { userId: user.id } })
        if (again) return again
        const workspace = await tx.workspace.create({ data: { name: `${user.name.split(' ')[0]}'s workspace` } })
        const member = await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'owner' } })
        await this.bootstrap(tx, workspace.id, user.id, workspace.name)
        const examples = [
          { title: 'Design team software licenses', supplier: 'Figma', amountCents: 432000, category: 'Software', justification: 'Annual seats for the six-person product design team.', supplierVerified: true, status: 'submitted' },
          { title: 'Engineering monitors', supplier: 'Dell Technologies', amountCents: 284000, category: 'Equipment', justification: 'Four monitors for the incoming engineering team.', supplierVerified: true, status: 'submitted' },
          { title: 'Customer research study', supplier: 'Fieldwork Studio', amountCents: 1250000, category: 'Services', justification: 'Recruitment and interviews for the next product discovery cycle.', supplierVerified: true, status: 'submitted' },
          { title: 'Office supplies · September', supplier: 'Staples', amountCents: 34800, category: 'Office', justification: 'Monthly stationery and shared office essentials.', supplierVerified: true, status: 'draft' },
          { title: 'Security assessment', supplier: 'Northstar Security', amountCents: 680000, category: 'Services', justification: 'Independent review of the customer-facing application.', supplierVerified: false, status: 'submitted' },
          { title: 'Team documentation workspace', supplier: 'Notion', amountCents: 192000, category: 'Software', justification: 'Renewal of the internal documentation workspace.', supplierVerified: true, status: 'approved' },
        ]
        for (const [index, data] of examples.entries()) {
          await tx.businessRecord.create({ data: { workspaceId: workspace.id, capability: 'procurement', entity: 'purchase_request', data: { ...data, decisionNote: '' }, createdAt: new Date(Date.now() - (examples.length - index) * 3600000) } })
        }
        await this.event(tx, { userId: user.id, name: user.name, workspaceId: workspace.id, role: 'owner', kind: 'human' }, 'workspace.create', 'applied', { message: 'Private workspace created with Site, Procurement, and operations projects. Seeded records are example data, not executed work or published claims.' })
        return member
      })
    } catch (error) {
      // A concurrent first request may have completed the same unique membership.
      const member = await this.db.membership.findUnique({ where: { userId: user.id } })
      if (member) return member
      throw error
    }
  }

  async snapshot(p: Principal, projectSlug?: string) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: p.workspaceId } })
      await this.bootstrap(tx, workspace.id, p.userId, workspace.name)
      const projectRows = sortProjects(await tx.project.findMany({ where: { workspaceId: p.workspaceId } }))
      const projects = projectRows.map(toProjectSnapshot)
      const caps = await tx.capability.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { slug: 'asc' } })
      const allCapabilities = caps.map(cap => ({ ...cap, definition: definitionSchema.parse(cap.definition) }))
      const [allRecords, allChanges, allExecutions] = await Promise.all([
        tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' } }),
        tx.changeSet.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
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
      const changes = slugs ? allChanges.filter(change => slugs.has(change.capability)) : allChanges
      const executions = slugs ? allExecutions.filter(event => {
        if (event.recordId) return recordIds.has(event.recordId)
        if (event.action === 'capability.publish') return slugs.has(procurement.slug)
        return slugs.has(event.action.split('.')[0] ?? '')
      }) : allExecutions
      const installed = current ? catalogFor(current.packages) : catalog
      const tools = capabilities.flatMap(cap => toolContracts(cap.definition))
      const capability = (current
        ? capabilities.find(cap => cap.slug === current.packages[0])
        : capabilities.find(cap => cap.slug === procurement.slug)) ?? capabilities[0]
      return { workspace, project: current, projects, capability, capabilities, records, changes, executions, tools, catalog: installed, principal: p }
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

  async createRecord(p: Principal, raw: unknown, slug = 'procurement') {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (!['owner', 'operator'].includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot create records.', 403)
      const cap = await this.capability(tx, p.workspaceId, slug)
      const data = validateFields(cap.definition.entity.fields, raw, true)
      const record = await tx.businessRecord.create({ data: { workspaceId: p.workspaceId, capability: cap.slug, entity: cap.definition.entity.name, data: json(data) } })
      await this.event(tx, p, 'record.create', 'applied', { title: data.title, capability: cap.slug, version: 1 }, record.id)
      return record
    })
  }

  async stage(p: Principal, command: { recordId: string; action: string; input: unknown; idempotencyKey: string }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      const record = await tx.businessRecord.findFirst({ where: { id: command.recordId, workspaceId: p.workspaceId } })
      if (!record) throw new KernelError('NOT_FOUND', 'Record not found.', 404)
      const cap = await this.capability(tx, p.workspaceId, record.capability)
      const result = evaluate(cap.definition, command.action, record.data as RecordData, command.input, p.role)
      const existing = await tx.changeSet.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: p.workspaceId, idempotencyKey: command.idempotencyKey } } })
      if (existing) {
        if (existing.recordId !== record.id || existing.action !== command.action || existing.proposedBy !== p.userId || existing.actorKind !== p.kind || JSON.stringify(existing.input) !== JSON.stringify(result.input)) throw new KernelError('IDEMPOTENCY_CONFLICT', 'This key was already used for a different proposal.', 409)
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
        proposedBy: p.userId, actorKind: p.kind, idempotencyKey: command.idempotencyKey,
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
        const result = evaluate(cap.definition, change.action, record.data as RecordData, change.input, proposer.role)
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

  async updatePolicies(p: Principal, expectedVersion: number, settings: { approvalLimitCents: number; requireVerifiedSupplier: boolean }) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (p.kind !== 'human' || p.role !== 'owner') throw new KernelError('FORBIDDEN', 'Only the workspace owner can publish policies.', 403)
      if (!Number.isSafeInteger(settings.approvalLimitCents) || settings.approvalLimitCents < 1 || settings.approvalLimitCents > 100000000 || typeof settings.requireVerifiedSupplier !== 'boolean') throw new KernelError('INVALID_SETTINGS', 'Invalid procurement policy settings.')
      const cap = await this.capability(tx, p.workspaceId, 'procurement')
      const definition = definitionSchema.parse({ ...cap.definition, settings: { ...cap.definition.settings, ...settings } })
      const changed = await tx.capability.updateMany({ where: { id: cap.id, workspaceId: p.workspaceId, version: expectedVersion }, data: { definition: json(definition), version: { increment: 1 } } })
      if (changed.count !== 1) throw new KernelError('STALE_DEFINITION', 'A newer capability version exists. Refresh before publishing.', 409)
      await tx.capabilityVersion.create({ data: { capabilityId: cap.id, version: cap.version + 1, definition: json(definition), publishedBy: p.userId } })
      await this.event(tx, p, 'capability.publish', 'applied', { fromVersion: cap.version, toVersion: cap.version + 1, before: cap.definition.settings, after: definition.settings })
      return { version: cap.version + 1, definition }
    })
  }
}
