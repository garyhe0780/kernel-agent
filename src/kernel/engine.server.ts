import { Prisma, PrismaClient } from '@prisma/client'
import { definitionSchema, evaluate, procurement, toolContracts, validateFields, type Principal, type RecordData } from './definition'

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

  async ensureWorkspace(user: { id: string; name: string }) {
    const found = await this.db.membership.findUnique({ where: { userId: user.id } })
    if (found) return found
    try {
      return await this.db.$transaction(async tx => {
        const again = await tx.membership.findUnique({ where: { userId: user.id } })
        if (again) return again
        const workspace = await tx.workspace.create({ data: { name: `${user.name.split(' ')[0]}'s workspace` } })
        const member = await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'owner' } })
        await tx.capability.create({ data: { workspaceId: workspace.id, slug: procurement.slug, definition: json(procurement), versions: { create: { version: 1, definition: json(procurement), publishedBy: user.id } } } })
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
        await this.event(tx, { userId: user.id, name: user.name, workspaceId: workspace.id, role: 'owner', kind: 'human' }, 'workspace.create', 'applied', { message: 'Private workspace created with six example requests and procurement v1. Example approvals are seeded data, not executed purchases.' })
        return member
      })
    } catch (error) {
      // A concurrent first request may have completed the same unique membership.
      const member = await this.db.membership.findUnique({ where: { userId: user.id } })
      if (member) return member
      throw error
    }
  }

  async snapshot(p: Principal) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      const cap = await this.capability(tx, p.workspaceId)
      const [workspace, records, changes, executions] = await Promise.all([
        tx.workspace.findUniqueOrThrow({ where: { id: p.workspaceId } }),
        tx.businessRecord.findMany({ where: { workspaceId: p.workspaceId, capability: cap.slug }, orderBy: { createdAt: 'desc' } }),
        tx.changeSet.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
        tx.execution.findMany({ where: { workspaceId: p.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      ])
      return { workspace, capability: cap, records, changes, executions, tools: toolContracts(cap.definition), principal: p }
    })
  }

  async createRecord(p: Principal, raw: unknown) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, p)
      if (!['owner', 'operator'].includes(p.role)) throw new KernelError('FORBIDDEN', 'Your role cannot create records.', 403)
      const cap = await this.capability(tx, p.workspaceId)
      const data = validateFields(cap.definition.entity.fields, raw, true)
      const record = await tx.businessRecord.create({ data: { workspaceId: p.workspaceId, capability: cap.slug, entity: cap.definition.entity.name, data: json(data) } })
      await this.event(tx, p, 'record.create', 'applied', { title: data.title, version: 1 }, record.id)
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
      const cap = await this.capability(tx, p.workspaceId)
      const definition = definitionSchema.parse({ ...cap.definition, settings: { ...cap.definition.settings, ...settings } })
      const changed = await tx.capability.updateMany({ where: { id: cap.id, workspaceId: p.workspaceId, version: expectedVersion }, data: { definition: json(definition), version: { increment: 1 } } })
      if (changed.count !== 1) throw new KernelError('STALE_DEFINITION', 'A newer capability version exists. Refresh before publishing.', 409)
      await tx.capabilityVersion.create({ data: { capabilityId: cap.id, version: cap.version + 1, definition: json(definition), publishedBy: p.userId } })
      await this.event(tx, p, 'capability.publish', 'applied', { fromVersion: cap.version, toVersion: cap.version + 1, before: cap.definition.settings, after: definition.settings })
      return { version: cap.version + 1, definition }
    })
  }
}
