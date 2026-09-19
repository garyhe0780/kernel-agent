import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { purchasingAssembly, purchasingExample } from '../src/kernel/application'
import { openTestDatabase } from './test-database'
import { AgentAccess } from '../src/kernel/agent-access.server'
import { handleAgentCredential } from '../src/lib/agent-api.server'
import { Kernel, KernelError } from '../src/kernel/engine.server'
import { applySettings, definitionSchema, evaluate, validateFields, type Principal, type RecordData } from '../src/kernel/definition'
import { procurement } from '../src/kernel/procurement'
import { commandAllows, kernelCommands } from '../src/kernel/commands'
import { composePublic, composeEditorial } from '../src/kernel/packages'

const { db, close } = await openTestDatabase()
const kernel = new Kernel(db)
let sequence = 0
after(close)

async function fixture() {
  const id = `user-${++sequence}`
  await db.user.create({ data: { id, name: 'Test Operator', email: `${id}@example.test` } })
  const member = await kernel.ensureWorkspace({ id, name: 'Test Operator' }, true)
  const human: Principal = { userId: id, name: 'Test Operator', workspaceId: member.workspaceId, role: member.role, kind: 'human' }
  const agent: Principal = { ...human, kind: 'agent' }
  const snapshot = await kernel.snapshot(human)
  const record = snapshot.records.find(r => (r.data as RecordData).title === 'Design team software licenses')!
  return { human, agent, record, snapshot }
}

test('agent stages a proposal; only human review applies it with a single audit event', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'approve-once' })
  assert.equal(staged.status, 'staged')
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 1)
  await assert.rejects(kernel.review(agent, staged.change!.id, 'apply'), (error: unknown) => error instanceof KernelError && error.code === 'HUMAN_APPROVAL_REQUIRED')
  await kernel.review(human, staged.change!.id, 'apply')
  const repeated = await kernel.review(human, staged.change!.id, 'apply')
  assert.equal(repeated.repeated, true)
  const updated = await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })
  assert.equal((updated.data as RecordData).status, 'approved')
  assert.equal(updated.version, 2)
  assert.equal(await db.execution.count({ where: { changeId: staged.change!.id, outcome: 'applied' } }), 1)
})

test('spending and supplier policies block writes and record the failed checks', async () => {
  const { human, agent, snapshot } = await fixture()
  for (const title of ['Customer research study', 'Security assessment']) {
    const record = snapshot.records.find(r => (r.data as RecordData).title === title)!
    const result = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: record.id })
    assert.equal(result.status, 'blocked')
    assert.equal(result.change, null)
  }
  const result = await kernel.snapshot(human)
  assert.equal(result.changes.length, 0)
  assert.equal(result.executions.filter(e => e.outcome === 'blocked').length, 2)
})

test('human and agent use the same policy evaluation', async () => {
  const { human, agent, record } = await fixture()
  const a = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'agent-proposal' })
  const b = await kernel.stage(human, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'human-proposal' })
  assert.deepEqual(a.checks, b.checks)
  assert.deepEqual(a.change?.after, b.change?.after)
})

test('cross-workspace reads, record staging, and proposal review are refused', async () => {
  const a = await fixture(), b = await fixture()
  assert.equal(b.snapshot.records.some(r => r.id === a.record.id), false)
  await assert.rejects(kernel.snapshot({ ...a.human, workspaceId: b.human.workspaceId }), /access/)
  await assert.rejects(kernel.stage(b.agent, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'cross-tenant' }), /not found/)
  const staged = await kernel.stage(a.agent, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'own-proposal' })
  await assert.rejects(kernel.review(b.human, staged.change!.id, 'apply'), /not found/)
})

test('idempotency returns the existing proposal and rejects a changed request', async () => {
  const { agent, record } = await fixture()
  const command = { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'stable-retry' }
  const first = await kernel.stage(agent, command)
  const second = await kernel.stage(agent, command)
  assert.equal(first.change!.id, second.change!.id)
  await assert.rejects(kernel.stage(agent, { ...command, action: 'decline', input: { reason: 'Changed intent' } }), /different proposal/)
})

test('a competing applied proposal makes the old record version stale', async () => {
  const { human, agent, record } = await fixture()
  const a = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'first-proposal' })
  const b = await kernel.stage(agent, { recordId: record.id, action: 'decline', input: { reason: 'Budget has been reallocated' }, idempotencyKey: 'second-proposal' })
  await kernel.review(human, a.change!.id, 'apply')
  await assert.rejects(kernel.review(human, b.change!.id, 'apply'), /changed/)
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 2)
})

test('publishing policies versions the definition and invalidates old proposals', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'before-publish' })
  const published = await kernel.publishSettings(human, { capability: 'procurement', expectedVersion: 1, settings: { approvalLimitCents: 100000, requireVerifiedSupplier: true } })
  assert.equal(published.version, 2)
  await assert.rejects(kernel.review(human, staged.change!.id, 'apply'), /changed/)
  const next = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'after-publish' })
  assert.equal(next.status, 'blocked')
  await assert.rejects(kernel.publishSettings(human, { capability: 'procurement', expectedVersion: 1, settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true } }), /newer/)
  const cap = await db.capability.findFirstOrThrow({ where: { workspaceId: human.workspaceId, slug: 'procurement' } })
  assert.equal(await db.capabilityVersion.count({ where: { capabilityId: cap.id } }), 2)
})

test('rejecting does not mutate the business record', async () => {
  const { human, agent, record } = await fixture()
  const proposal = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'reject-proposal' })
  await kernel.review(human, proposal.change!.id, 'reject')
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 1)
  await assert.rejects(kernel.review(human, proposal.change!.id, 'apply'), /resolved/)
})

test('creation rejects unknown fields and direct status injection', async () => {
  const { human } = await fixture()
  const data = { title: 'New request', supplier: 'Supplier', amountCents: 10000, category: 'Office', justification: 'Office supplies needed' }
  await assert.rejects(kernel.createRecord(human, { ...data, status: 'approved' }, 'procurement'), /set by the kernel/)
  await assert.rejects(kernel.createRecord(human, { ...data, workspaceId: 'someone-else' }, 'procurement'), /Unknown field/)
  const record = await kernel.createRecord(human, data, 'procurement')
  assert.equal((record.data as RecordData).status, 'draft')
  assert.equal((record.data as RecordData).supplierVerified, false)
})

test('revoked proposal permissions are checked again at apply', async () => {
  const { human, agent, record } = await fixture()
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'revoke-proposer' })
  await db.membership.update({ where: { userId_workspaceId: { userId: human.userId, workspaceId: human.workspaceId } }, data: { role: 'viewer' } })
  await assert.rejects(kernel.review(human, staged.change!.id, 'apply'), /access/)
  await assert.rejects(kernel.review({ ...human, role: 'viewer' }, staged.change!.id, 'apply'), /review/)
})

test('required action input and monetary bounds are enforced', () => {
  const record = { title: 'Request', supplier: 'Supplier', amountCents: 100, category: 'Office', justification: 'Reason here', supplierVerified: true, status: 'submitted', decisionNote: '' }
  assert.throws(() => evaluate(procurement, 'decline', record, {}, 'owner'), /required/)
  assert.throws(() => validateFields(procurement.entity.fields, { ...record, amountCents: 1.5 }), /whole/)
  assert.throws(() => validateFields(procurement.entity.fields, { ...record, amountCents: -1 }), /range/)
})

test('the command catalog keeps construction on Core and operate-agents on stage', () => {
  assert.equal(kernelCommands.stage.layer, 'core')
  assert.equal(kernelCommands.publish_settings.layer, 'core')
  assert.equal(kernelCommands.save_draft.layer, 'core')
  assert.equal(kernelCommands.publish_draft.layer, 'core')
  assert.equal(kernelCommands.install_purchasing_demo.layer, 'fixture')
  assert.equal(kernelCommands.operate.layer, 'host')
  assert.deepEqual(Object.keys(kernelCommands).filter(name => commandAllows(name, 'operate-agent')), ['stage'])
  assert.deepEqual(Object.keys(kernelCommands).filter(name => commandAllows(name, 'construct-agent')), ['save_draft', 'edit_project', 'preview_migration', 'publish_draft'])
  assert.equal(commandAllows('stage', 'operate-agent'), true)
  assert.equal(commandAllows('publish_draft', 'operate-agent'), false)
  assert.equal(commandAllows('stage', 'construct-agent'), false)
  assert.equal(commandAllows('publish_settings', 'operate-agent'), false)
  assert.equal(commandAllows('create', 'operate-agent'), false)
  assert.ok(!Object.keys(kernelCommands).some(name => /procurement|approval|crm|ticket/i.test(name)))
})

const queue = definitionSchema.parse({
  slug: 'queue', name: 'Queue', description: 'Track tickets against a response clock.',
  entity: {
    name: 'ticket', label: 'Ticket',
    fields: {
      title: { label: 'Ticket', type: 'string', min: 3, max: 80 },
      waitHours: { label: 'Hours waiting', type: 'integer', min: 0, max: 720 },
      status: { label: 'Status', type: 'enum', options: ['open', 'closed'], default: 'open', editable: false },
    },
  },
  settings: { slaHours: 24, requireAssignee: true },
  reviewerRoles: ['owner'],
  actions: [{
    name: 'close', label: 'Close ticket', description: 'Propose closing this ticket.',
    roles: ['owner', 'operator'], input: {},
    preconditions: [{ id: 'open', label: 'Ticket is open', field: 'status', operator: 'eq', value: 'open' }],
    policies: [{ id: 'sla', label: 'Within SLA', field: 'waitHours', operator: 'lte', setting: 'slaHours' }],
    effects: { status: 'closed' },
  }],
})

test('applySettings accepts the same keys for unrelated businesses and rejects swapped shapes', () => {
  assert.equal(applySettings(procurement, { approvalLimitCents: 50000, requireVerifiedSupplier: false }).settings.approvalLimitCents, 50000)
  assert.equal(applySettings(queue, { slaHours: 4, requireAssignee: false }).settings.slaHours, 4)
  assert.throws(() => applySettings(procurement, { slaHours: 4, requireAssignee: false }), /published keys/)
  assert.throws(() => applySettings(queue, { approvalLimitCents: 1, requireVerifiedSupplier: true }), /published keys/)
  assert.throws(() => applySettings(queue, { slaHours: 4 }), /published keys/)
  assert.throws(() => applySettings(queue, { slaHours: 4.5, requireAssignee: true }), /whole number/)
})

test('publishSettings versions any capability settings and refuses managed applications', async () => {
  const { human } = await fixture()
  await db.capability.create({ data: { workspaceId: human.workspaceId, slug: 'queue', definition: queue, versions: { create: { version: 1, definition: queue, publishedBy: human.userId } } } })
  const tickets = await kernel.publishSettings(human, { capability: 'queue', expectedVersion: 1, settings: { slaHours: 4, requireAssignee: false } })
  assert.equal(tickets.version, 2)
  assert.deepEqual(tickets.definition.settings, { slaHours: 4, requireAssignee: false })
  const purchasing = await kernel.publishSettings(human, { capability: 'procurement', expectedVersion: 1, settings: { approvalLimitCents: 250000, requireVerifiedSupplier: false } })
  assert.equal(purchasing.definition.settings.approvalLimitCents, 250000)
  await assert.rejects(kernel.publishSettings(human, { capability: 'queue', expectedVersion: 2, settings: { slaHours: 4 } }), /published keys/)
  const built = await publishedFixture()
  const requests = await db.capability.findFirstOrThrow({ where: { workspaceId: built.human.workspaceId, slug: `${built.slug}__requests` } })
  await assert.rejects(kernel.publishSettings(built.human, { capability: requests.slug, expectedVersion: requests.version, settings: definitionSchema.parse(requests.definition).settings }), (error: unknown) => error instanceof KernelError && error.code === 'MANAGED_DEFINITION')
})

test('a workspace installs Site, Blog, Procurement, and suite packages', async () => {
  const { snapshot } = await fixture()
  assert.deepEqual(snapshot.capabilities.map(cap => cap.slug).sort(), ['assets', 'audit', 'blog', 'crm', 'helpdesk', 'hr', 'orders', 'procurement', 'projects', 'site'])
  assert.equal(snapshot.records.filter(record => record.capability === 'site').length, 1)
  assert.equal(snapshot.records.filter(record => record.capability === 'blog').length, 3)
  assert.equal(snapshot.records.filter(record => record.capability === 'procurement').length, 6)
  assert.equal(snapshot.records.filter(record => record.capability === 'crm').length, 3)
})

test('a workspace has Site, Procurement, operations, and Audit projects', async () => {
  const { human, snapshot } = await fixture()
  assert.deepEqual(snapshot.projects.map(project => [project.slug, project.shell, project.packages]), [
    ['site', 'site', ['site', 'blog']],
    ['procurement', 'workbench', ['procurement']],
    ['crm', 'workbench', ['crm']],
    ['orders', 'workbench', ['orders']],
    ['helpdesk', 'workbench', ['helpdesk']],
    ['projects', 'workbench', ['projects']],
    ['assets', 'workbench', ['assets']],
    ['hr', 'workbench', ['hr']],
    ['audit', 'workbench', ['audit']],
  ])
  const site = await kernel.snapshot(human, 'site')
  assert.equal(site.project?.slug, 'site')
  assert.deepEqual(site.capabilities.map(cap => cap.slug), ['site', 'blog'])
  assert.equal(site.records.some(record => record.capability === 'procurement'), false)
  const procurementProject = await kernel.snapshot(human, 'procurement')
  assert.deepEqual(procurementProject.capabilities.map(cap => cap.slug), ['procurement'])
  assert.equal(procurementProject.records.some(record => record.capability === 'blog' || record.capability === 'site'), false)
  const crm = await kernel.snapshot(human, 'crm')
  assert.deepEqual(crm.capabilities.map(cap => cap.slug), ['crm'])
  assert.equal(crm.records.length, 3)
  assert.equal(crm.records.some(record => record.capability !== 'crm'), false)
  const audit = await kernel.snapshot(human, 'audit')
  assert.deepEqual(audit.capabilities.map(cap => cap.slug), ['audit'])
  assert.equal(audit.records.length, 4)
  assert.equal(audit.records.some(record => record.capability !== 'audit'), false)
  await assert.rejects(kernel.snapshot(human, 'missing'), (error: unknown) => error instanceof KernelError && error.code === 'NOT_FOUND')
})

test('audit assessment is staged; remediation is blocked until it is applied', async () => {
  const { human, agent, snapshot } = await fixture()
  const finding = snapshot.records.find(record => record.capability === 'audit' && (record.data as RecordData).title === 'Privileged access recertification')!
  const blocked = await kernel.stage(agent, { recordId: finding.id, action: 'remediate', input: {}, idempotencyKey: 'remediate-before-assess' })
  assert.equal(blocked.status, 'blocked')
  const staged = await kernel.stage(agent, {
    recordId: finding.id, action: 'assess',
    input: { assessment: 'Admin roles include contractors who are outside the recertification roster.', confidence: 76 },
    idempotencyKey: 'assess-finding',
  })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  const updated = await db.businessRecord.findUniqueOrThrow({ where: { id: finding.id } })
  assert.equal((updated.data as RecordData).assessed, true)
  assert.equal((updated.data as RecordData).confidence, 76)
  const remediating = await kernel.stage(agent, { recordId: finding.id, action: 'remediate', input: {}, idempotencyKey: 'remediate-after-assess' })
  assert.equal(remediating.status, 'staged')
})

test('CRM convert is staged and applied like every other kernel action', async () => {
  const { human, agent, snapshot } = await fixture()
  const lead = snapshot.records.find(record => record.capability === 'crm' && (record.data as RecordData).title === 'Northwind Foods')!
  const staged = await kernel.stage(agent, { recordId: lead.id, action: 'convert', input: {}, idempotencyKey: 'convert-lead' })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: lead.id } })).data as RecordData).status, 'converted')
})

test('the public site is composed from published package views only', async () => {
  const { human, snapshot } = await fixture()
  const site = await kernel.publicSite(human.workspaceId)
  assert.deepEqual(site.blocks.map(block => block.slug), ['site', 'blog'])
  assert.equal(site.blocks[0].view, 'hero')
  assert.equal(site.blocks[1].records.length, 2)
  assert.equal(site.blocks[1].records.some(record => record.data.status !== 'published'), false)
  assert.equal(site.blocks.some(block => block.records.some(record => snapshot.records.some(item => item.id === record.id && item.capability === 'procurement'))), false)
  const draft = snapshot.records.find(record => record.capability === 'blog' && (record.data as RecordData).status === 'draft')!
  assert.equal(site.blocks[1].records.some(record => record.id === draft.id), false)
})

test('applying a blog publish makes the note public', async () => {
  const { human, agent, snapshot } = await fixture()
  const draft = snapshot.records.find(record => record.capability === 'blog' && (record.data as RecordData).status === 'draft')!
  const staged = await kernel.stage(agent, { recordId: draft.id, action: 'publish', input: {}, idempotencyKey: 'publish-note' })
  assert.equal(staged.status, 'staged')
  await kernel.review(human, staged.change!.id, 'apply')
  const site = await kernel.publicSite(human.workspaceId)
  const notes = site.blocks.find(block => block.slug === 'blog')!
  assert.equal(notes.records.some(record => record.id === draft.id), true)
})

test('composePublic skips drafts and packages without a public view', () => {
  const blocks = composePublic([
    { id: '1', capability: 'site', data: { title: 'Live', standfirst: 'Standfirst here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '2', capability: 'site', data: { title: 'Hidden', standfirst: 'Standfirst here', body: 'Body copy here', status: 'draft' }, createdAt: '2026-09-11' },
    { id: '3', capability: 'blog', data: { title: 'Note', excerpt: 'Excerpt here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '4', capability: 'procurement', data: { title: 'PO', status: 'approved' }, createdAt: '2026-09-11' },
  ])
  assert.deepEqual(blocks.map(block => [block.slug, block.view, block.records.map(record => record.id)]), [
    ['site', 'hero', ['1']],
    ['blog', 'article-list', ['3']],
  ])
})

test('composeEditorial includes drafts and omits procurement', () => {
  const blocks = composeEditorial([
    { id: '1', capability: 'site', data: { title: 'Live', standfirst: 'Standfirst here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '2', capability: 'site', data: { title: 'Hidden', standfirst: 'Standfirst here', body: 'Body copy here', status: 'draft' }, createdAt: '2026-09-11' },
    { id: '3', capability: 'blog', data: { title: 'Note', excerpt: 'Excerpt here', body: 'Body copy here', status: 'published' }, createdAt: '2026-09-11' },
    { id: '4', capability: 'procurement', data: { title: 'PO', status: 'approved' }, createdAt: '2026-09-11' },
  ])
  assert.deepEqual(blocks.map(block => [block.slug, block.records.map(record => record.id)]), [
    ['site', ['1', '2']],
    ['blog', ['3']],
  ])
})

test('new accounts receive a labeled purchasing demo with sample records', async () => {
  const id = `user-${++sequence}`
  await db.user.create({ data: { id, name: 'New Builder', email: `${id}@example.test` } })
  const member = await kernel.ensureWorkspace({ id, name: 'New Builder' })
  const p: Principal = { userId: id, name: 'New Builder', workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const first = await kernel.snapshot(p)
  assert.equal(first.projects.length, 1)
  assert.equal(first.projects[0].demo, true)
  assert.equal(first.projects[0].slug, 'demo-purchasing')
  assert.equal(first.projects[0].name, 'Demo · Team purchasing')
  assert.equal(first.records.length, 12)
  assert.equal(first.records.filter(record => record.capability.endsWith('__requests')).length, 6)
  await kernel.ensureWorkspace({ id, name: 'New Builder' })
  assert.equal((await kernel.snapshot(p)).projects.length, 1)
  const other = await fixture()
  assert.equal((await kernel.snapshot(other.human)).records.some(record => record.capability.startsWith('demo-purchasing__')), false)
  assert.ok(first.records.every(record => record.capability.startsWith('demo-purchasing__')))
  const draft = first.records.find(record => (record.data as RecordData).status === 'draft')
  assert.ok(draft)
  const staged = await kernel.stage(p, { recordId: draft.id, action: 'submit', input: {}, idempotencyKey: `demo-submit-${id}` })
  assert.equal(staged.status, 'staged')
  assert.ok(staged.change)
  await kernel.review(p, staged.change.id, 'apply')
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: draft.id } })).data as RecordData).status, 'submitted')
})

test('purchasing demo can be removed and reinstalled, and extra workspaces stay empty', async () => {
  const id = `user-${++sequence}`
  await db.user.create({ data: { id, name: 'Demo Owner', email: `${id}@example.test` } })
  const member = await kernel.ensureWorkspace({ id, name: 'Demo Owner' })
  const owner: Principal = { userId: id, name: 'Demo Owner', workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const operator: Principal = { ...owner, kind: 'agent' }
  await assert.rejects(kernel.removePurchasingDemoProject(operator), /owner/)
  await kernel.removePurchasingDemoProject(owner)
  const emptied = await kernel.snapshot(owner)
  assert.equal(emptied.projects.length, 0)
  assert.equal(emptied.records.length, 0)
  await assert.rejects(kernel.removePurchasingDemoProject(owner), /not in this workspace/)
  await assert.rejects(kernel.installPurchasingDemoProject(operator), /owner/)
  const restored = await kernel.installPurchasingDemoProject(owner)
  assert.equal(restored.installed, true)
  assert.equal(restored.slug, 'demo-purchasing')
  assert.equal((await kernel.installPurchasingDemoProject(owner)).installed, false)
  assert.equal((await kernel.snapshot(owner)).projects[0].demo, true)
  const created = await kernel.createWorkspace(owner, 'Empty extra workspace')
  const extra: Principal = { ...owner, workspaceId: created.id }
  const extraState = await kernel.snapshot(extra)
  assert.equal(extraState.projects.length, 0)
  assert.equal(extraState.records.length, 0)
})

test('assembled drafts compile, persist the assembly, and reopen it when changing the published application', async () => {
  const { linearAssembly, purchasingAssembly, compileAssembly } = await import('../src/kernel/application')
  const { human } = await fixture()
  assert.equal((await kernel.listModules(human)).some(item => item.id === 'purchasing.request' && item.defaultAlias === 'requests'), true)
  const sales = (await kernel.listModules(human)).find(item => item.id === 'sales.opportunity')
  assert.equal(sales?.defaultAlias, 'opportunities')
  assert.equal(sales?.actions.some(action => action.name === 'convert'), true)
  assert.equal(sales?.surfaces.some(surface => surface.kind === 'queue' && surface.name === 'Open pipeline'), true)
  const issue = (await kernel.listModules(human)).find(item => item.id === 'work.issue')
  assert.equal(issue?.defaultAlias, 'issues')
  assert.equal(issue?.ports.some(port => port.field === 'assignee' && port.required === false), true)
  const issues = await kernel.saveDraft(human, { brief: 'Issue tracking for the operations team', assembly: linearAssembly(), source: 'agent' })
  const publishedIssues = await kernel.publishDraft(human, issues.id, issues.version)
  const issueState = await kernel.snapshot(human, publishedIssues.slug)
  assert.deepEqual(issueState.capabilities.map(item => item.definition.entity.name), ['issue', 'project', 'party'])
  assert.equal(issueState.records.length, 0)
  const assembly = purchasingAssembly()
  await assert.rejects(kernel.saveDraft(human, { brief: 'Purchasing for our team', assembly: { ...assembly, modules: [] }, source: 'agent' }))
  const draft = await kernel.saveDraft(human, { brief: 'Purchasing for our team', assembly, source: 'agent' })
  assert.equal(draft.assembly?.modules[0].use, 'purchasing.request')
  assert.deepEqual(draft.definition.entities.map(entity => entity.slug), compileAssembly(assembly).entities.map(entity => entity.slug))
  const published = await kernel.publishDraft(human, draft.id, draft.version)
  const state = await kernel.snapshot(human, published.slug)
  assert.equal(state.capabilities.length, 2)
  assert.equal(state.records.length, 0)
  const change = await kernel.editProject(human, published.slug)
  assert.equal(change.assembly?.modules[1].use, 'directory.party')
})

test('draft publication is versioned, idempotent, isolated, and creates no example records', async () => {
  const { purchasingExample } = await import('../src/kernel/application')
  const { human, agent } = await fixture()
  const other = await fixture()
  const draft = await kernel.saveDraft(human, { brief: 'Purchasing for our team', definition: purchasingExample(), source: 'example' })
  assert.equal((await kernel.listDrafts(human))[0].id, draft.id)
  assert.equal((await kernel.listDrafts(other.human)).length, 0)
  await assert.rejects(kernel.getDraft(other.human, draft.id))
  await assert.rejects(kernel.saveDraft(agent, { brief: 'Purchasing for our team', definition: purchasingExample(), source: 'example' }), /owners/)
  await assert.rejects(kernel.publishDraft(agent, draft.id, 1))
  await assert.rejects(kernel.publishDraft(other.human, draft.id, 1))
  const revised = await kernel.saveDraft(human, { id: draft.id, expectedVersion: 1, brief: draft.brief, definition: { ...purchasingExample(), name: 'Revised purchasing' }, source: 'manual' })
  await assert.rejects(kernel.saveDraft(human, { id: draft.id, expectedVersion: 1, brief: draft.brief, definition: purchasingExample(), source: 'manual' }))
  await assert.rejects(kernel.publishDraft(human, draft.id, 1))
  const published = await kernel.publishDraft(human, draft.id, revised.version)
  assert.equal((await kernel.publishDraft(human, draft.id, revised.version)).repeated, true)
  const state = await kernel.snapshot(human, published.slug)
  assert.equal(state.project?.name, 'Revised purchasing')
  assert.equal(state.capabilities.length, 2)
  assert.equal(state.records.length, 0)
  assert.equal((await kernel.listDrafts(human)).length, 0)
  assert.equal(await db.execution.count({ where: { workspaceId: human.workspaceId, action: 'project.publish' } }), 1)
  for (const cap of state.capabilities) assert.equal(await db.capabilityVersion.count({ where: { capabilityId: cap.id } }), 1)
})

test('generated applications enforce relationships and support the full purchasing lifecycle', async () => {
  const { purchasingExample } = await import('../src/kernel/application')
  const { human, agent } = await fixture()
  const app = purchasingExample()
  const create = async () => {
    const draft = await kernel.saveDraft(human, { brief: 'Purchasing for our team', definition: app, source: 'example' })
    return (await kernel.publishDraft(human, draft.id, 1)).slug
  }
  const first = await create()
  const second = await create()
  const supplier = await kernel.createRecord(human, { title: 'Example supplier' }, `${first}__suppliers`)
  const data = { title: 'Team monitors', supplier: supplier.id, amountCents: 10000, category: 'Equipment', justification: 'Equipment for the new team', supplierVerified: true }
  await assert.rejects(kernel.createRecord(human, { ...data, supplier: '' }, `${first}__requests`))
  await assert.rejects(kernel.createRecord(human, { ...data, supplier: 'missing' }, `${first}__requests`))
  await assert.rejects(kernel.createRecord(human, data, `${second}__requests`))
  const record = await kernel.createRecord(human, data, `${first}__requests`)
  const submitted = await kernel.stage(agent, { recordId: record.id, action: 'submit', input: {}, idempotencyKey: 'generated-submit' })
  await kernel.review(human, submitted.change!.id, 'apply')
  const approved = await kernel.stage(agent, { recordId: record.id, action: 'approve', input: {}, idempotencyKey: 'generated-approve' })
  await kernel.review(human, approved.change!.id, 'apply')
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).data as RecordData).status, 'approved')
  assert.equal((await kernel.snapshot(human, second)).records.length, 0)
})

test('application validation rejects broken definitions before saving', async () => {
  const { purchasingExample, validateApplication } = await import('../src/kernel/application')
  const brokenReference = purchasingExample()
  brokenReference.entities[0].entity.fields.supplier.reference = 'unknown'
  assert.throws(() => validateApplication(brokenReference))
  const brokenAction = purchasingExample()
  brokenAction.entities[0].actions[0].effects.unknown = 'bad'
  assert.throws(() => validateApplication(brokenAction))
  const brokenInput = purchasingExample()
  brokenInput.entities[0].actions[0].effects.title = '$input.missing'
  assert.throws(() => validateApplication(brokenInput))
  const brokenRule = purchasingExample()
  brokenRule.entities[0].actions[1].policies[0].setting = 'missing'
  assert.throws(() => validateApplication(brokenRule))
  const brokenDefault = purchasingExample()
  brokenDefault.entities[0].entity.fields.status.default = 'unknown'
  assert.throws(() => validateApplication(brokenDefault))
})

async function publishedFixture() {
  const { purchasingExample } = await import('../src/kernel/application')
  const f = await fixture()
  const draft = await kernel.saveDraft(f.human, { brief: 'Purchasing application', definition: purchasingExample(), source: 'example' })
  const { slug } = await kernel.publishDraft(f.human, draft.id, 1)
  const supplier = await kernel.createRecord(f.human, { title: 'Existing supplier', contact: 'keep@example.test' }, `${slug}__suppliers`)
  const record = await kernel.createRecord(f.human, { title: 'Existing request', supplier: supplier.id, amountCents: 10000, category: 'Equipment', justification: 'Preserve this business data', supplierVerified: true }, `${slug}__requests`)
  return { ...f, slug, supplier, record }
}

async function revisedDraft(human: Principal, slug: string, revise: (app: import('../src/kernel/application').Application) => void) {
  const { validateApplication } = await import('../src/kernel/application')
  const draft = await kernel.editProject(human, slug)
  const app = validateApplication(draft.definition)
  revise(app)
  return kernel.saveDraft(human, { id: draft.id, expectedVersion: draft.version, definition: app, brief: 'Revise the application', source: 'manual' })
}

test('publishing an additive migration preserves records, versions definitions, and invalidates affected proposals', async () => {
  const { human, agent, slug, record, supplier } = await publishedFixture()
  const proposal = await kernel.stage(agent, { recordId: record.id, action: 'submit', input: {}, idempotencyKey: 'before-migration' })
  const draft = await revisedDraft(human, slug, app => {
    app.entities[0].entity.fields.department = { label: 'Department', type: 'string', required: true, editable: true, default: 'General' }
    app.entities[0].settings.approvalLimitCents = 500000
  })
  await assert.rejects(kernel.publishDraft(human, draft.id, draft.version), (e: unknown) => e instanceof KernelError && e.code === 'PREVIEW_REQUIRED')
  const preview = await kernel.previewMigration(human, draft.id, draft.version)
  assert.equal(preview.report.canPublish, true)
  assert.equal(preview.report.recordCount, 2)
  assert.equal(preview.report.updatedRecordCount, 1)
  assert.equal(preview.report.invalidatedProposals, 1)
  assert.ok(preview.report.changes.some(c => c.label === 'Department' && c.after.includes('General')))
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).version, 1)
  const result = await kernel.publishDraft(human, draft.id, draft.version, preview.token)
  assert.equal(result.version, 2)
  assert.equal((await kernel.publishDraft(human, draft.id, draft.version, preview.token)).repeated, true)
  const stored = await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })
  assert.deepEqual(stored.data, { ...(record.data as RecordData), department: 'General' })
  assert.equal(stored.version, 2)
  assert.deepEqual((await db.businessRecord.findUniqueOrThrow({ where: { id: supplier.id } })).data, supplier.data)
  const state = await kernel.snapshot(human, slug)
  assert.equal(state.project?.version, 2)
  assert.equal(state.capabilities.find(c => c.slug.endsWith('__requests'))?.version, 2)
  assert.equal(state.capabilities.find(c => c.slug.endsWith('__suppliers'))?.version, 1)
  await assert.rejects(kernel.review(human, proposal.change!.id, 'apply'), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PROPOSAL')
  const history = await kernel.projectHistory(human, slug)
  assert.deepEqual(history.map(v => v.version), [2, 1])
  assert.equal((history[1].definition as { entities: { entity: { fields: Record<string, unknown> } }[] }).entities[0].entity.fields.department, undefined)
})

test('updated defaults never overwrite existing values; new entities start empty', async () => {
  const { human, slug, record } = await publishedFixture()
  const first = await revisedDraft(human, slug, app => { app.entities[0].entity.fields.department = { label: 'Department', type: 'string', required: true, editable: true, default: 'General' } })
  const p1 = await kernel.previewMigration(human, first.id, first.version)
  await kernel.publishDraft(human, first.id, first.version, p1.token)
  const next = await revisedDraft(human, slug, app => {
    app.entities[0].entity.fields.department.default = 'Finance'
    const departments = structuredClone(app.entities[1]); departments.slug = 'departments'; departments.name = 'Departments'; departments.entity.name = 'department'; departments.entity.label = 'Department'
    app.entities.push(departments)
    app.navigation.push({ entity: 'departments', label: 'Departments' })
  })
  const p2 = await kernel.previewMigration(human, next.id, next.version)
  assert.equal(p2.report.updatedRecordCount, 0)
  await kernel.publishDraft(human, next.id, next.version, p2.token)
  const state = await kernel.snapshot(human, slug)
  assert.equal(state.capabilities.length, 3)
  assert.equal(state.records.filter(r => r.capability.endsWith('__departments')).length, 0)
  assert.equal((state.records.find(r => r.id === record.id)!.data as RecordData).department, 'General')
})

test('migration blocks removals, type changes, and incompatible required fields without mutating live data', async () => {
  const { human, slug, record } = await publishedFixture()
  const variants: ((app: import('../src/kernel/application').Application) => void)[] = [
    app => { delete app.entities[1].entity.fields.contact },
    app => { app.entities[1].entity.fields.contact = { label: 'Contact', type: 'boolean', required: false, editable: true, default: false } },
    app => { app.entities[0].entity.fields.department = { label: 'Department', type: 'string', required: true, editable: true } },
    app => { app.entities[0].entity.fields.supplier.required = false; delete app.entities[0].entity.fields.supplier.reference; app.entities.pop() },
  ]
  const original = await kernel.editProject(human, slug)
  for (const revise of variants) {
    const { validateApplication } = await import('../src/kernel/application')
    const current = await kernel.getDraft(human, original.id)
    const app = validateApplication(original.definition)
    // Keep presentation valid so this test reaches the record migration guard.
    app.layouts = []; app.views = []; app.navigation = []; app.startView = null
    revise(app)
    const draft = await kernel.saveDraft(human, { id: current.id, expectedVersion: current.version, definition: app, brief: 'Test incompatible migration', source: 'manual' })
    const preview = await kernel.previewMigration(human, draft.id, draft.version)
    assert.equal(preview.report.canPublish, false)
    assert.ok(preview.report.blockerCount > 0)
    await assert.rejects(kernel.publishDraft(human, draft.id, draft.version, preview.token), (e: unknown) => e instanceof KernelError && e.code === 'MIGRATION_BLOCKED')
    assert.deepEqual((await db.businessRecord.findUniqueOrThrow({ where: { id: record.id } })).data, record.data)
    assert.equal((await kernel.snapshot(human, slug)).project?.version, 1)
    assert.equal((await kernel.projectHistory(human, slug)).length, 1)
  }
})

test('records and proposals changed after preview require a fresh preview', async () => {
  const { human, agent, slug, record } = await publishedFixture()
  const draft = await revisedDraft(human, slug, app => { app.entities[0].settings.approvalLimitCents = 500000 })
  const p1 = await kernel.previewMigration(human, draft.id, draft.version)
  await kernel.createRecord(human, { title: 'Supplier added after preview' }, `${slug}__suppliers`)
  await assert.rejects(kernel.publishDraft(human, draft.id, draft.version, p1.token), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PREVIEW')
  const p2 = await kernel.previewMigration(human, draft.id, draft.version)
  const staged = await kernel.stage(agent, { recordId: record.id, action: 'submit', input: {}, idempotencyKey: 'after-preview' })
  await assert.rejects(kernel.publishDraft(human, draft.id, draft.version, p2.token), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PREVIEW')
  const p3 = await kernel.previewMigration(human, draft.id, draft.version)
  await kernel.review(human, staged.change!.id, 'apply')
  await assert.rejects(kernel.publishDraft(human, draft.id, draft.version, p3.token), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PREVIEW')
  const fresh = await kernel.previewMigration(human, draft.id, draft.version)
  assert.equal((await kernel.publishDraft(human, draft.id, draft.version, fresh.token)).version, 2)
})

test('draft edits invalidate preview receipts and competing application changes reject stale bases', async () => {
  const { human, slug } = await publishedFixture()
  const first = await revisedDraft(human, slug, app => { app.name = 'Revised name' })
  const preview = await kernel.previewMigration(human, first.id, first.version)
  const competitor = await db.projectDraft.create({ data: { workspaceId: human.workspaceId, definition: first.definition!, brief: first.brief, source: 'manual', createdBy: human.userId, projectSlug: slug, baseProjectVersion: 1 } })
  const competingPreview = await kernel.previewMigration(human, competitor.id, competitor.version)
  const saved = await kernel.saveDraft(human, { id: first.id, expectedVersion: first.version, definition: first.definition, brief: 'Another draft edit', source: 'manual' })
  await assert.rejects(kernel.publishDraft(human, saved.id, saved.version, preview.token), (e: unknown) => e instanceof KernelError && e.code === 'PREVIEW_REQUIRED')
  const current = await kernel.previewMigration(human, saved.id, saved.version)
  await kernel.publishDraft(human, saved.id, saved.version, current.token)
  await assert.rejects(kernel.publishDraft(human, competitor.id, competitor.version, competingPreview.token), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PROJECT')
  await assert.rejects(kernel.previewMigration(human, competitor.id, competitor.version), (e: unknown) => e instanceof KernelError && e.code === 'STALE_PROJECT')
  assert.equal((await kernel.publishDraft(human, saved.id, saved.version)).repeated, true)
})

test('migration access is tenant-scoped, owner-only, and publication is human-only', async () => {
  const { human, agent, slug } = await publishedFixture()
  const other = await fixture()
  const draft = await kernel.editProject(human, slug)
  assert.equal((await kernel.editProject(human, slug)).id, draft.id)
  await assert.rejects(kernel.editProject(other.human, slug))
  await assert.rejects(kernel.projectHistory(other.human, slug))
  await assert.rejects(kernel.previewMigration(other.human, draft.id, draft.version))
  const preview = await kernel.previewMigration(human, draft.id, draft.version)
  await assert.rejects(kernel.publishDraft(agent, draft.id, draft.version, preview.token))
  await assert.rejects(kernel.publishDraft(other.human, draft.id, draft.version, preview.token))
  await db.membership.update({ where: { userId_workspaceId: { userId: human.userId, workspaceId: human.workspaceId } }, data: { role: 'operator' } })
  const operator = { ...human, role: 'operator' }
  await assert.rejects(kernel.editProject(operator, slug))
  await assert.rejects(kernel.projectHistory(operator, slug))
  await assert.rejects(kernel.previewMigration(operator, draft.id, draft.version))
  await assert.rejects(kernel.publishDraft(operator, draft.id, draft.version, preview.token))
})

const access = new AgentAccess(db)
async function credentialFixture() {
  const data = await fixture()
  const project = data.snapshot.projects.find(p => p.packages.includes('procurement'))!
  const issued = await access.create(data.human, { project: project.slug, name: 'Test agent', expiresInDays: 30, actions: [{ capability: 'procurement', action: 'approve', version: 1 }] })
  return { ...data, project, ...issued, machine: await access.authenticate(issued.token) }
}

test('scoped credentials store only hashes, disclose secrets once, and bind records and operator actions', async () => {
  const f = await credentialFixture()
  assert.equal(f.machine.role, 'operator')
  assert.equal(f.machine.kind, 'agent')
  const stored = await db.agentCredential.findUniqueOrThrow({ where: { id: f.credential.id } })
  assert.notEqual(stored.tokenHash, f.token)
  assert.equal(stored.tokenHash.length, 64)
  const listed = await access.list(f.human, f.project.slug)
  assert.ok(!JSON.stringify(listed).includes(f.token))
  assert.ok(!JSON.stringify(listed).includes(stored.tokenHash))
  const state = await kernel.agentSnapshot(f.machine)
  assert.ok(state.records.every(r => f.project.packages.includes(r.capability)))
  assert.ok(state.capabilities.flatMap(c => c.tools).every(t => t.name === 'procurement.approve'))
  const tool = state.capabilities.flatMap(c => c.tools)[0]
  assert.equal(tool.inputSchema.properties.type.const, 'stage')
  assert.equal(tool.inputSchema.properties.action.const, 'approve')
  assert.equal(tool.inputSchema.properties.input.type, 'object')
  assert.deepEqual(tool.inputSchema.required, ['type', 'recordId', 'action', 'input', 'idempotencyKey'])
  const command = { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'credential-action' }
  const result = await kernel.stage(f.machine, command)
  assert.equal(result.change?.agentCredentialId, f.credential.id)
  assert.equal((await kernel.stage(f.machine, command)).change?.id, result.change?.id)
  const event = await db.execution.findFirstOrThrow({ where: { changeId: result.change!.id } })
  assert.equal(event.actorId, f.credential.id)
  assert.equal(event.actorName, 'Test agent')
  assert.equal((await kernel.agentProposal(f.machine, result.change!.id)).change.status, 'pending')
  await kernel.review(f.human, result.change!.id, 'apply')
  assert.equal((await kernel.agentProposal(f.machine, result.change!.id)).change.status, 'applied')
})

test('agent scopes reject unrelated records, forbidden actions, human functions and forged identities', async () => {
  const f = await credentialFixture(), other = await fixture()
  const unrelated = f.snapshot.records.find(r => !f.project.packages.includes(r.capability))!
  await assert.rejects(kernel.stage(f.machine, { recordId: unrelated.id, action: 'publish', input: {}, idempotencyKey: 'out-of-project' }), /outside/)
  await assert.rejects(kernel.stage(f.machine, { recordId: other.record.id, action: 'approve', input: {}, idempotencyKey: 'out-of-tenant' }), /not found/)
  await assert.rejects(kernel.stage(f.machine, { recordId: f.record.id, action: 'reject', input: {}, idempotencyKey: 'out-of-action' }), /outside/)
  await assert.rejects(kernel.snapshot(f.machine), /only read/)
  await assert.rejects(kernel.createRecord(f.machine, {}, 'procurement'), /only read/)
  await assert.rejects(kernel.saveDraft(f.machine, { brief: 'A test', definition: purchasingExample(), source: 'manual' }), /stage proposals/)
  await assert.rejects(kernel.stage({ ...f.machine, role: 'owner' }, { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'forged-role' }), /identity/)
  await assert.rejects(access.create(f.machine, { project: f.project.slug, name: 'Nested', expiresInDays: 1, actions: f.credential.actions }), /owner/)
  assert.equal((await access.list(other.human, f.project.slug)).length, 0)
  await assert.rejects(access.revoke(other.human, f.credential.id), /not found/)
})

test('revocation, expiry, owner removal and definition changes prevent use and pending apply', async () => {
  for (const mutation of ['revoke', 'expire', 'demote', 'definition']) {
    const f = await credentialFixture()
    const staged = await kernel.stage(f.machine, { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: `pending-${mutation}` })
    if (mutation === 'revoke') { await access.revoke(f.human, f.credential.id); await access.revoke(f.human, f.credential.id) }
    if (mutation === 'expire') await db.agentCredential.update({ where: { id: f.credential.id }, data: { expiresAt: new Date(0) } })
    if (mutation === 'demote') await db.membership.update({ where: { userId_workspaceId: { userId: f.human.userId, workspaceId: f.human.workspaceId } }, data: { role: 'operator' } })
    if (mutation === 'definition') await kernel.publishSettings(f.human, { capability: 'procurement', expectedVersion: 1, settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true } })
    await assert.rejects(kernel.stage(f.machine, { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'after-mutation' }))
    if (mutation !== 'definition') await assert.rejects(access.authenticate(f.token))
    else assert.equal((await kernel.agentSnapshot(f.machine)).staleActions.length, 1)
    if (mutation === 'demote') {
      // Restore owner only after proving the old principal cannot bypass current membership.
      await assert.rejects(kernel.review(f.human, staged.change!.id, 'apply'))
    } else {
      await assert.rejects(kernel.review(f.human, staged.change!.id, 'apply'))
      await kernel.review(f.human, staged.change!.id, 'reject')
    }
    assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: f.record.id } })).version, 1)
  }
})

test('credentials cannot collide on idempotency keys or read another credential proposal', async () => {
  const f = await credentialFixture()
  const second = await access.create(f.human, { project: f.project.slug, name: 'Second agent', expiresInDays: 1, actions: f.credential.actions })
  const p = await access.authenticate(second.token)
  const command = { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'same-key-two-agents' }
  const staged = await kernel.stage(f.machine, command)
  await assert.rejects(kernel.stage(p, command), /different proposal/)
  await assert.rejects(kernel.agentProposal(p, staged.change!.id), /not found/)
  await assert.rejects(kernel.review(f.machine, staged.change!.id, 'apply'), /only read/)
})

test('credential API authenticates headers, enforces scope, returns proposal status and rejects extra authority', async () => {
  const f = await credentialFixture()
  const call = (body?: unknown, token = f.token, query = '') => handleAgentCredential(new Request(`http://localhost/api/agent${query}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), access, kernel)
  const read = await call()
  assert.equal(read.status, 200)
  assert.equal(read.headers.get('cache-control'), 'no-store')
  assert.equal((await read.json()).project.slug, f.project.slug)
  assert.equal((await call(undefined, 'bad')).status, 401)
  assert.equal((await call(undefined, f.token, '?project=another')).status, 400)
  assert.equal((await call({ type: 'review', decision: 'apply' })).status, 403)
  assert.equal((await call({ type: 'create_agent_credential' })).status, 403)
  assert.equal((await call({ type: 'stage', recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'api-agent-stage', role: 'owner' })).status, 400)
  const staged = await call({ type: 'stage', recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'api-agent-stage' })
  assert.equal(staged.status, 200)
  const change = (await staged.json()).change
  assert.equal((await (await call(undefined, f.token, `?change=${change.id}`)).json()).change.status, 'pending')
  await access.revoke(f.human, f.credential.id)
  assert.equal((await call()).status, 401)
})

test('agent record pagination remains scoped to the application', async () => {
  const f = await credentialFixture()
  await db.businessRecord.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ workspaceId: f.human.workspaceId, capability: 'procurement', entity: 'purchase_request', data: { title: `Page ${i}` } })) })
  const first = await kernel.agentSnapshot(f.machine)
  assert.equal(first.records.length, 100)
  assert.ok(first.nextCursor)
  const second = await kernel.agentSnapshot(f.machine, first.nextCursor)
  assert.equal(second.nextCursor, null)
  assert.ok(second.records.length > 0)
  assert.ok(!second.records.some(r => first.records.some(previous => previous.id === r.id)))
  assert.ok(second.records.every(r => f.project.packages.includes(r.capability)))
})


test('agent grant creation validates authority, application scope, expiry and reviewed definition', async () => {
  const f = await credentialFixture()
  const grant = { project: f.project.slug, name: 'Invalid grant', expiresInDays: 30, actions: [{ capability: 'procurement', action: 'approve', version: 1 }] }
  await assert.rejects(access.create(f.agent, grant), /owner/)
  await assert.rejects(access.create(f.human, { ...grant, expiresInDays: 91 }))
  await assert.rejects(access.create(f.human, { ...grant, actions: [] }))
  await assert.rejects(access.create(f.human, { ...grant, actions: [{ capability: 'procurement', action: 'approve', version: 2 }] }), /Refresh/)
  await assert.rejects(access.create(f.human, { ...grant, actions: [{ capability: 'procurement', action: 'invented', version: 1 }] }), /operators/)
  await assert.rejects(access.create(f.human, { ...grant, actions: [{ capability: 'unrelated', action: 'publish', version: 1 }] }), /this application/)
  assert.equal((await access.list(f.human, f.project.slug)).length, 1)
})

test('MCP official client discovers scoped tools, stages idempotently and reads proposal outcomes', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const { handleMcp } = await import('../src/lib/mcp.server')
  const f = await credentialFixture()
  const client = new Client({ name: 'kernel-integration-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${f.token}` } },
    fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel),
  })
  try {
    await client.connect(transport)
    assert.equal(client.getServerVersion()?.name, 'kernel')
    const tools = await client.listTools()
    assert.equal(tools.tools.length, 3)
    const tool = tools.tools.find(t => t.name.startsWith('stage_'))!
    assert.ok(tool.description?.includes('review'))
    const records = await client.callTool({ name: 'list_records', arguments: {} })
    assert.equal((records.structuredContent as { project: { slug: string } }).project.slug, f.project.slug)
    const args = { recordId: f.record.id, input: {}, idempotencyKey: 'mcp-official-client' }
    const first = await client.callTool({ name: tool.name, arguments: args })
    assert.equal(first.isError, false)
    const change = (first.structuredContent as { change: { id: string } }).change
    const again = await client.callTool({ name: tool.name, arguments: args })
    assert.equal((again.structuredContent as { change: { id: string } }).change.id, change.id)
    assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: f.record.id } })).version, 1)
    await kernel.review(f.human, change.id, 'apply')
    const status = await client.callTool({ name: 'get_proposal', arguments: { changeId: change.id } })
    assert.equal((status.structuredContent as { change: { status: string } }).change.status, 'applied')
    const forbidden = await client.callTool({ name: 'apply', arguments: {} })
    assert.equal(forbidden.isError, true)
    await access.revoke(f.human, f.credential.id)
    await assert.rejects(client.listTools())
  } finally { await client.close() }
})

test('MCP transport rejects missing credentials, hostile origins, invalid protocol messages and oversized bodies', async () => {
  const { handleMcp } = await import('../src/lib/mcp.server')
  const f = await credentialFixture()
  const headers = { Authorization: `Bearer ${f.token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }
  const call = (body: string, extra: Record<string, string> = {}, url = 'http://localhost:3000/api/mcp') => handleMcp(new Request(url, { method: 'POST', headers: { ...headers, ...extra }, body }), access, kernel)
  assert.equal((await call('{}', { Authorization: '' })).status, 401)
  assert.equal((await call('{}', { Origin: 'https://untrusted.example' })).status, 403)
  assert.equal((await call('{}', {}, 'http://untrusted.example/api/mcp')).status, 403)
  assert.equal((await call('{}', {}, 'http://localhost:3000/api/mcp?token=secret')).status, 400)
  assert.equal((await call('{}', { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await call('{')).status, 400)
  assert.equal((await call(' '.repeat(128001))).status, 413)
  const unknown = await call(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'invented' }))
  assert.equal((await unknown.json()).error.code, -32601)
  const notification = await call(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))
  assert.equal(notification.status, 202)
  const get = await handleMcp(new Request('http://localhost:3000/api/mcp', { headers }), access, kernel)
  assert.equal(get.status, 405)
  assert.equal(get.headers.get('allow'), 'POST')
})

test('MCP action calls preserve tenant and entity boundaries and reject stale scopes and extra arguments', async () => {
  const { handleMcp } = await import('../src/lib/mcp.server')
  const f = await credentialFixture(), other = await fixture()
  const call = async (method: string, params?: unknown) => {
    const reply = await handleMcp(new Request('http://localhost:3000/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${f.token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), access, kernel)
    return reply.json()
  }
  const tools = await call('tools/list')
  const name = tools.result.tools.find((t: { name: string }) => t.name.startsWith('stage_')).name
  const command = { recordId: f.record.id, input: {}, idempotencyKey: 'mcp-negative-test' }
  assert.equal((await call('tools/call', { name, arguments: { ...command, role: 'owner' } })).result.isError, true)
  assert.equal((await call('tools/call', { name, arguments: { ...command, recordId: other.record.id } })).result.isError, true)
  const unrelated = f.snapshot.records.find(r => !f.project.packages.includes(r.capability))!
  assert.equal((await call('tools/call', { name, arguments: { ...command, recordId: unrelated.id } })).result.structuredContent.code, 'AGENT_SCOPE')
  const expensive = f.snapshot.records.find(r => (r.data as RecordData).title === 'Customer research study')!
  const blocked = await call('tools/call', { name, arguments: { ...command, recordId: expensive.id } })
  assert.equal(blocked.result.isError, true)
  assert.equal(blocked.result.structuredContent.status, 'blocked')
  await kernel.publishSettings(f.human, { capability: 'procurement', expectedVersion: 1, settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true } })
  assert.equal((await call('tools/list')).result.tools.length, 2)
  assert.equal((await call('tools/call', { name, arguments: command })).result.isError, true)
})

test('builder credentials create and publish applications over MCP and cannot operate records', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const { handleMcp } = await import('../src/lib/mcp.server')
  const f = await credentialFixture()
  const created = await kernel.createWorkspace(f.human, 'Builder workspace')
  const owner: Principal = { ...f.human, workspaceId: created.id }
  await assert.rejects(access.create(owner, { kind: 'construct', name: 'Bad', expiresInDays: 30, project: f.project.slug }), /workspace-wide/)
  const issued = await access.create(owner, { kind: 'construct', name: 'Cursor', expiresInDays: 30 })
  const builder = await access.authenticate(issued.token)
  assert.equal(builder.agentGrant, 'construct')
  assert.equal(builder.role, 'owner')
  assert.equal((await access.listWorkspace(owner)).some(item => item.kind === 'construct' && item.id === issued.credential.id), true)
  assert.equal((await handleAgentCredential(new Request('http://localhost/api/agent', { headers: { Authorization: `Bearer ${issued.token}` } }), access, kernel)).status, 403)
  await assert.rejects(kernel.stage(builder, { recordId: f.record.id, action: 'approve', input: {}, idempotencyKey: 'builder-stage' }), /creates applications/)
  const client = new Client({ name: 'kernel-builder-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${issued.token}` } },
    fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel),
  })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map(tool => tool.name), ['list_blocks', 'list_modules', 'list_applications', 'list_drafts', 'get_draft', 'save_draft', 'edit_project', 'preview_migration', 'publish_draft'])
    const forbidden = await client.callTool({ name: 'list_records', arguments: {} })
    assert.equal(forbidden.isError, true)
    const modules = await client.callTool({ name: 'list_modules', arguments: {} })
    assert.equal(modules.isError, false)
    const catalog = (modules.structuredContent as { modules: { id: string }[] }).modules
    assert.ok(catalog.some(item => item.id === 'purchasing.request'))
    assert.ok(catalog.some(item => item.id === 'directory.party'))
    assert.ok(catalog.some(item => item.id === 'sales.opportunity'))
    assert.ok(catalog.some(item => item.id === 'work.issue'))
    assert.ok(catalog.some(item => item.id === 'work.project'))
    const blocks = await client.callTool({ name: 'list_blocks', arguments: {} })
    assert.equal(blocks.isError, false)
    const blockList = (blocks.structuredContent as { blocks: { id: string; wired: boolean }[] }).blocks
    assert.ok(blockList.some(item => item.id === 'table' && item.wired))
    assert.ok(blockList.some(item => item.id === 'board' && item.wired))
    assert.ok(blockList.some(item => item.id === 'chart' && !item.wired))
    const { purchasingAssembly, salesAssembly } = await import('../src/kernel/application')
    const invented = await client.callTool({ name: 'save_draft', arguments: { brief: 'Invented application', definition: purchasingExample() } })
    assert.equal(invented.isError, true)
    const sales = await client.callTool({ name: 'save_draft', arguments: { brief: 'Sales pipeline for the operations team', assembly: salesAssembly() } })
    assert.equal(sales.isError, false)
    const salesDraft = (sales.structuredContent as { draft: { id: string; version: number } }).draft
    const salesPublished = await client.callTool({ name: 'publish_draft', arguments: { id: salesDraft.id, expectedVersion: salesDraft.version } })
    assert.equal(salesPublished.isError, false)
    const saved = await client.callTool({ name: 'save_draft', arguments: { brief: 'Purchasing for the operations team', assembly: purchasingAssembly() } })
    assert.equal(saved.isError, false)
    const draft = (saved.structuredContent as { draft: { id: string; version: number } }).draft
    const published = await client.callTool({ name: 'publish_draft', arguments: { id: draft.id, expectedVersion: draft.version } })
    assert.equal(published.isError, false)
    const publication = (published.structuredContent as { publication: { slug: string; version: number } }).publication
    const listed = await client.callTool({ name: 'list_applications', arguments: {} })
    const applications = (listed.structuredContent as { applications: { slug: string }[] }).applications
    assert.ok(applications.some(app => app.slug === publication.slug))
    const operate = await access.create(owner, { project: publication.slug, name: 'Operator', expiresInDays: 30, actions: [{ capability: `${publication.slug}__requests`, action: 'submit', version: 1 }] })
    const operateClient = new Client({ name: 'kernel-operate-isolation', version: '1.0.0' })
    const operateTransport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), {
      requestInit: { headers: { Authorization: `Bearer ${operate.token}` } },
      fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel),
    })
    try {
      await operateClient.connect(operateTransport)
      const operateTools = await operateClient.listTools()
      assert.ok(operateTools.tools.some(tool => tool.name === 'list_records'))
      assert.ok(!operateTools.tools.some(tool => tool.name === 'save_draft'))
      const operateSave = await operateClient.callTool({ name: 'save_draft', arguments: { brief: 'Should not publish', assembly: purchasingAssembly() } })
      assert.equal(operateSave.isError, true)
    } finally { await operateClient.close() }
  } finally { await client.close() }
})

test('saved views publish with namespaced navigation and view-only revisions preserve pending actions', async () => {
  const { human } = await fixture()
  const app = purchasingExample()
  const draft = await kernel.saveDraft(human, { brief: 'Purchasing with saved work views', definition: app, source: 'manual' })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  const supplier = await kernel.createRecord(human, { title: 'View test supplier' }, `${slug}__suppliers`)
  const record = await kernel.createRecord(human, { title: 'View test order', supplier: supplier.id, amountCents: 10000, category: 'Equipment', justification: 'Verify presentation updates preserve data', supplierVerified: true }, `${slug}__requests`)
  const pending = await kernel.stage(human, { recordId: record.id, action: 'submit', input: {}, idempotencyKey: `view-submit-${slug}` })
  const before = await kernel.snapshot(human, slug)
  assert.equal(before.project?.presentation?.startView, 'awaiting_decision')
  assert.equal(before.project?.presentation?.views[0].entity, `${slug}__requests`)
  const edit = await kernel.editProject(human, slug)
  const { validateApplication } = await import('../src/kernel/application')
  const next = validateApplication(edit.definition)
  next.layouts = [{ entity: 'requests', sections: [{ id: 'decision', name: 'Review evidence', fields: ['status', 'supplierVerified'] }] }]
  next.layouts[0].sections[0].when = { field: 'status', operator: 'eq', value: 'approved' }
  next.views[0].name = 'Purchases to review'
  next.navigation.reverse()
  next.startView = 'active'
  const saved = await kernel.saveDraft(human, { id: edit.id, expectedVersion: edit.version, brief: edit.brief, definition: next, source: 'manual' })
  const preview = await kernel.previewMigration(human, saved.id, saved.version)
  assert.equal(preview.report.updatedRecordCount, 0)
  assert.equal(preview.report.invalidatedProposals, 0)
  assert(preview.report.changes.some(change => change.label.startsWith('View:')))
  await kernel.publishDraft(human, saved.id, saved.version, preview.token)
  const after = await kernel.snapshot(human, slug)
  assert.equal(after.project?.presentation?.navigation[0].entity, `${slug}__suppliers`)
  assert.equal(after.project?.presentation?.views[0].name, 'Purchases to review')
  assert.equal(after.project?.presentation?.layouts[0].entity, `${slug}__requests`)
  assert.equal(after.project?.presentation?.layouts[0].sections[0].name, 'Review evidence')
  assert.equal(after.project?.presentation?.layouts[0].sections[0].when?.value, 'approved')
  assert(preview.report.changes.some(change => change.after.includes('when Status equals approved')))
  assert(preview.report.changes.some(change => change.label.startsWith('Record layout:')))
  assert.deepEqual(after.capabilities.map(cap => cap.version), before.capabilities.map(cap => cap.version))
  assert.deepEqual(after.records.map(record => record.data), before.records.map(record => record.data))
  await kernel.review(human, pending.change!.id, 'apply')
  assert.equal((await kernel.projectHistory(human, slug)).length, 2)
  const other = await fixture()
  await assert.rejects(kernel.snapshot(other.human, slug), /Project not found/)
})

test('second-process CRM acceptance: publish an empty app, review lifecycle, and update views and sections', async () => {
  const { crmAcceptanceApplication } = await import('./fixtures/crm-application')
  const { matchesView } = await import('../src/kernel/application-views')
  const { recordSections } = await import('../src/kernel/application-layouts')
  const { human, agent } = await fixture()
  const app = crmAcceptanceApplication()
  const draft = await kernel.saveDraft(human, { brief: 'Synthetic CRM acceptance', definition: app, source: 'example' })
  assert.deepEqual((await kernel.getDraft(human, draft.id)).definition, app)
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  assert.equal((await kernel.snapshot(human, slug)).records.length, 0)
  const capability = `${slug}__crm`
  const lead = await kernel.createRecord(human, { title: 'QA sample opportunity', company: 'QA Sample Company', contact: 'QA Contact', source: 'Referral' }, capability)
  const read = async () => (await db.businessRecord.findUniqueOrThrow({ where: { id: lead.id } })).data as RecordData
  assert.equal((await kernel.stage(agent, { recordId: lead.id, action: 'convert', input: {}, idempotencyKey: 'crm-too-early' })).status, 'blocked')
  assert.deepEqual(recordSections(app.entities[0], app.layouts[0], await read()).map(s => s.id), ['contact'])
  const opened = await kernel.stage(agent, { recordId: lead.id, action: 'open', input: {}, idempotencyKey: 'crm-open' })
  assert.equal((await read()).status, 'draft')
  await assert.rejects(kernel.review(agent, opened.change!.id, 'apply'), /human/i)
  await kernel.review(human, opened.change!.id, 'apply')
  assert.equal(matchesView(await read(), app.views[0]), true)
  assert.deepEqual(recordSections(app.entities[0], app.layouts[0], await read()).map(s => s.id), ['contact', 'progress'])
  const converted = await kernel.stage(agent, { recordId: lead.id, action: 'convert', input: {}, idempotencyKey: 'crm-convert' })
  assert.equal(matchesView(await read(), app.views[0]), true)
  await kernel.review(human, converted.change!.id, 'apply')
  assert.equal(matchesView(await read(), app.views[0]), false)
  assert.equal(matchesView(await read(), app.views[1]), true)
  assert.equal((await kernel.review(human, converted.change!.id, 'apply')).repeated, true)
  const state = await kernel.snapshot(human, slug)
  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].version, 3)
  assert.equal(state.changes.filter(c => c.status === 'applied').length, 2)
  assert.equal(state.executions.filter(e => e.outcome === 'applied' && e.changeId && e.recordId === lead.id).length, 2)
})


test('plans persist decisions, require confirmation and reject late build results and stale publication', async () => {
  const { human, agent } = await fixture()
  const content = { request: 'Track purchasing for our team.', messages: [{ role: 'user', text: 'Track purchasing for our team.' }], answers: {}, proposal: { plan: { name: 'Purchasing', summary: 'Purchase review', records: 'Requests and suppliers', workflow: 'Draft to submitted to approved', rules: 'Owners review all changes', limitations: 'No integrations' }, questions: [] } }
  const first = await kernel.savePlan(human, { content })
  assert.equal((await kernel.listPlans(human))[0].content.request, content.request)
  await assert.rejects(kernel.planState(agent, first.id, first.version, 'confirmed'))
  await assert.rejects(kernel.planState(human, first.id, first.version, 'building'))
  const confirmed = await kernel.planState(human, first.id, first.version, 'confirmed')
  const building = await kernel.planState(human, first.id, confirmed.version, 'building')
  const edited = await kernel.savePlan(human, { id: first.id, expectedVersion: building.version, content: { ...content, request: 'Revised purchase workflow for our team.' } })
  await assert.rejects(kernel.finishPlan(human, first.id, building.version, purchasingExample()))
  await assert.rejects(kernel.planState(human, first.id, edited.version, 'confirmed'), /Update the plan/)
  const refreshed = await kernel.planState(human, first.id, edited.version, 'planning', { ...content, needsProposal: false })
  const again = await kernel.planState(human, first.id, refreshed.version, 'confirmed')
  const claim = await kernel.planState(human, first.id, again.version, 'building')
  const draft = await kernel.finishPlan(human, first.id, claim.version, purchasingAssembly())
  assert.equal(draft.assembly?.modules[0].use, 'purchasing.request')
  const generated = (await kernel.listPlans(human))[0]
  assert.equal(generated.status, 'generated')
  await kernel.savePlan(human, { id: first.id, expectedVersion: generated.version, content })
  await assert.rejects(kernel.publishDraft(human, draft.id, draft.version), /current confirmed plan/)
  const other = await fixture()
  await assert.rejects(kernel.planState(other.human, first.id, generated.version + 1))
})

test('unanswered plan questions prevent confirmation', async () => {
  const { human } = await fixture()
  const plan = await kernel.savePlan(human, { content: { request: 'Plan a purchase workflow.', messages: [], answers: {}, proposal: null } })
  await assert.rejects(kernel.planState(human, plan.id, plan.version, 'confirmed'), /open questions/)
})


test('saving a follow-up keeps confirmation blocked across reload and client attempts to clear pending state', async () => {
  const { human } = await fixture()
  const content = { request: 'Create a simple lead tracker.', messages: [], answers: {}, proposal: { plan: { name: 'Leads', summary: 'Track leads', records: 'Title', workflow: 'Draft to open', rules: 'Owner review', limitations: '' }, questions: [] } }
  const plan = await kernel.savePlan(human, { content })
  const pending = await kernel.savePlan(human, { id: plan.id, expectedVersion: plan.version, content: { ...content, messages: [{ role: 'user', text: 'Add required company' }] } })
  const reloaded = (await kernel.listPlans(human))[0]
  assert.equal(reloaded.content.needsProposal, true)
  await assert.rejects(kernel.planState(human, plan.id, pending.version, 'confirmed'), /Update the plan/)
  const attempted = await kernel.savePlan(human, { id: plan.id, expectedVersion: pending.version, content: { ...reloaded.content, needsProposal: false } })
  await assert.rejects(kernel.planState(human, plan.id, attempted.version, 'confirmed'), /Update the plan/)
})

test('workspace inbox includes old pending approvals, isolates tenants and excludes reviewed work', async () => {
  const a = await fixture(), b = await fixture()
  const staged = await kernel.stage(a.agent, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'inbox-pending' })
  const row = await db.changeSet.findUniqueOrThrow({ where: { id: staged.change!.id } })
  await db.changeSet.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ ...row, input: {}, before: {}, after: {}, checks: [], id: `inbox-history-${a.human.userId}-${index}`, idempotencyKey: `history-${index}`, status: 'rejected', createdAt: new Date(Date.now() + index) })) })
  const pending = await kernel.inbox(a.human)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, row.id)
  assert.equal(pending[0].projectSlug, 'procurement')
  assert.equal(pending[0].stale, false)
  assert.ok((await kernel.snapshot(a.human, 'procurement')).changes.some(change => change.id === row.id && change.status === 'pending'))
  assert.deepEqual(await kernel.inbox(b.human), [])
  await assert.rejects(kernel.inbox({ ...a.human, workspaceId: b.human.workspaceId }), /access/)
  await db.businessRecord.update({ where: { id: a.record.id }, data: { version: { increment: 1 } } })
  assert.equal((await kernel.inbox(a.human))[0].stale, true)
  await kernel.review(a.human, row.id, 'reject')
  assert.deepEqual(await kernel.inbox(a.human), [])
})

test('activity pagination is stable across timestamp ties and rejects another workspace cursor', async () => {
  const a = await fixture(), b = await fixture()
  const stamp = new Date('2030-01-01T00:00:00Z')
  await db.execution.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ id: `activity-${a.human.userId}-${String(index).padStart(3, '0')}`, workspaceId: a.human.workspaceId, actorId: a.human.userId, actorName: 'Test', actorKind: 'human', action: 'procurement.approve', outcome: 'staged', recordId: a.record.id, details: { privateValue: 'not in public summary' }, createdAt: stamp })) })
  const first = await kernel.activity(a.human)
  assert.equal(first.items.length, 50)
  assert.ok(first.nextCursor)
  assert.equal(first.items[0].projectSlug, 'procurement')
  assert.equal(first.items[0].recordTitle, (a.record.data as RecordData).title)
  assert.ok(!JSON.stringify(first).includes('privateValue'))
  const second = await kernel.activity(a.human, first.nextCursor!)
  assert.ok(second.items.length >= 5)
  assert.ok(second.items.every(item => !first.items.some(previous => previous.id === item.id)))
  await assert.rejects(kernel.activity(b.human, first.nextCursor!), /not found/)
  await assert.rejects(kernel.activity({ ...a.human, workspaceId: b.human.workspaceId }), /access/)
})

test('workspace agent directory is owner-only, redacts credentials and reports lifecycle states', async () => {
  const a = await fixture(), b = await fixture(), access = new AgentAccess(db)
  const cap = a.snapshot.capabilities.find(item => item.slug === 'procurement')!
  const grant = await access.create(a.human, { project: 'procurement', name: 'Directory test', expiresInDays: 1, actions: [{ capability: cap.slug, action: 'approve', version: cap.version }] })
  const listed = await access.listWorkspace(a.human)
  assert.equal(listed[0].state, 'Active')
  assert.ok(!JSON.stringify(listed).includes(grant.token))
  assert.ok(!JSON.stringify(listed).includes('tokenHash'))
  assert.deepEqual(await access.listWorkspace(b.human), [])
  await assert.rejects(access.listWorkspace({ ...a.human, role: 'operator' }), /owner/)
  await assert.rejects(access.listWorkspace(a.agent), /owner/)
  await db.capability.update({ where: { workspaceId_slug: { workspaceId: a.human.workspaceId, slug: cap.slug } }, data: { version: { increment: 1 } } })
  assert.equal((await access.listWorkspace(a.human))[0].state, 'Needs review')
  await db.agentCredential.update({ where: { id: grant.credential.id }, data: { expiresAt: new Date(0) } })
  assert.equal((await access.listWorkspace(a.human))[0].state, 'Expired')
  await access.revoke(a.human, grant.credential.id)
  assert.equal((await access.listWorkspace(a.human))[0].state, 'Revoked')
})

test('workspace settings and rename require owner access, protect concurrent edits and record history', async () => {
  const a = await fixture(), b = await fixture()
  const settings = await kernel.workspaceSettings(a.human)
  assert.equal(settings.members.length, 1)
  assert.equal(settings.members[0].user.id, a.human.userId)
  await assert.rejects(kernel.workspaceSettings({ ...a.human, workspaceId: b.human.workspaceId }), /access/)
  await assert.rejects(kernel.workspaceSettings(a.agent), /owner/)
  await assert.rejects(kernel.renameWorkspace(a.agent, 'Changed', settings.workspace.name), /owner/)
  await assert.rejects(kernel.renameWorkspace(a.human, ' ', settings.workspace.name), /name/)
  assert.deepEqual(await kernel.renameWorkspace(a.human, '  Updated workspace  ', settings.workspace.name), { name: 'Updated workspace' })
  await assert.rejects(kernel.renameWorkspace(a.human, 'Stale update', settings.workspace.name), /changed/)
  assert.equal((await kernel.workspaceSettings(a.human)).workspace.name, 'Updated workspace')
  assert.equal((await kernel.workspaceSettings(b.human)).workspace.name, b.snapshot.workspace.name)
  assert.ok((await kernel.activity(a.human)).items.some(item => item.action === 'workspace.rename'))
})

test('users create and select isolated workspaces with workspace-specific membership roles', async () => {
  const a = await fixture(), b = await fixture()
  const created = await kernel.createWorkspace(a.human, '  Second workspace  ')
  assert.equal(created.name, 'Second workspace')
  const membership = await kernel.workspaceMembership({ id: a.human.userId, name: a.human.name }, created.id)
  assert.equal(membership.role, 'owner')
  const second = { ...a.human, workspaceId: created.id }
  assert.equal((await kernel.listWorkspaces(a.human)).length, 2)
  const state = await kernel.snapshot(second)
  assert.equal(state.projects.length, 0)
  assert.equal(state.records.length, 0)
  assert.deepEqual(await kernel.listDrafts(second), [])
  await assert.rejects(kernel.stage(second, { recordId: a.record.id, action: 'approve', input: {}, idempotencyKey: 'cross-workspace-stage' }), /not found/)
  await assert.rejects(kernel.workspaceMembership({ id: b.human.userId, name: b.human.name }, created.id), /access/)
  await assert.rejects(kernel.createWorkspace(a.agent, 'Agent workspace'), /people/)
  await db.membership.update({ where: { userId_workspaceId: { userId: a.human.userId, workspaceId: created.id } }, data: { role: 'operator' } })
  assert.equal((await kernel.workspaceMembership({ id: a.human.userId, name: a.human.name }, created.id)).role, 'operator')
  assert.equal((await kernel.workspaceMembership({ id: a.human.userId, name: a.human.name }, a.human.workspaceId)).role, 'owner')
  await db.membership.delete({ where: { userId_workspaceId: { userId: a.human.userId, workspaceId: created.id } } })
  await assert.rejects(kernel.workspaceMembership({ id: a.human.userId, name: a.human.name }, created.id), /access/)
  assert.equal((await kernel.ensureWorkspace({ id: a.human.userId, name: a.human.name })).workspaceId, a.human.workspaceId)
})

test('workspace invitations bind recipient, expire, revoke, and preserve isolated roles', async () => {
  const a = await fixture(), b = await fixture(), c = await fixture()
  const bEmail = `${b.human.userId}@example.test`
  const invite = await kernel.inviteMember(a.human, bEmail.toUpperCase(), 'operator')
  assert.ok(invite.token.length > 60)
  assert.equal((await kernel.workspaceSettings(a.human)).invitations.length, 1)
  await assert.rejects(kernel.acceptInvitation(c.human, invite.token))
  await assert.rejects(kernel.acceptInvitation(b.agent, invite.token))
  const joined = await kernel.acceptInvitation(b.human, invite.token)
  assert.equal(joined.workspaceId, a.human.workspaceId)
  const membership = await kernel.workspaceMembership({id:b.human.userId,name:'Test'}, joined.workspaceId)
  assert.equal(membership.role, 'operator')
  assert.equal((await kernel.workspaceMembership({id:b.human.userId,name:'Test'}, b.human.workspaceId)).role, 'owner')
  await assert.rejects(kernel.acceptInvitation(b.human, invite.token))
  const operator = {...b.human, workspaceId:a.human.workspaceId,role:'operator'}
  await assert.rejects(kernel.inviteMember(operator, `${c.human.userId}@example.test`, 'owner'))
  await assert.rejects(kernel.updateMember(operator, a.human.userId, 'owner', 'remove'))
  await assert.rejects(kernel.updateMember(a.human, a.human.userId, 'owner', 'remove'))
  await assert.rejects(kernel.updateMember(c.human, b.human.userId, 'operator', 'owner'))
  await kernel.updateMember(a.human, b.human.userId, 'operator', 'owner')
  await assert.rejects(kernel.updateMember(a.human, b.human.userId, 'operator', 'remove'))
  await kernel.updateMember(a.human, b.human.userId, 'owner', 'remove')
  await assert.rejects(kernel.workspaceMembership({id:b.human.userId,name:'Test'}, a.human.workspaceId))
  const revoked = await kernel.inviteMember(a.human, bEmail, 'operator')
  const pending = (await kernel.workspaceSettings(a.human)).invitations[0]
  await assert.rejects(kernel.revokeInvitation(c.human, pending.id))
  await kernel.revokeInvitation(a.human, pending.id)
  await assert.rejects(kernel.acceptInvitation(b.human, revoked.token))
  const expired = await kernel.inviteMember(a.human, bEmail, 'operator')
  await db.workspaceInvitation.updateMany({where:{workspaceId:a.human.workspaceId},data:{expiresAt:new Date(0)}})
  await assert.rejects(kernel.acceptInvitation(b.human, expired.token))
  const old = await kernel.inviteMember(a.human, bEmail, 'operator')
  const replacement = await kernel.inviteMember(a.human, bEmail, 'owner')
  await assert.rejects(kernel.acceptInvitation(b.human, old.token))
  await kernel.acceptInvitation(b.human, replacement.token)
  assert.equal((await kernel.workspaceMembership({id:b.human.userId,name:'Test'}, a.human.workspaceId)).role, 'owner')
})

test('demoting an inviter invalidates their pending invitations', async () => {
  const a = await fixture(), b = await fixture(), c = await fixture()
  await db.membership.create({data:{workspaceId:a.human.workspaceId,userId:b.human.userId,role:'owner'}})
  const ownerB = {...b.human,workspaceId:a.human.workspaceId}
  const invite = await kernel.inviteMember(ownerB, `${c.human.userId}@example.test`, 'owner')
  assert.equal((await kernel.previewInvitation(c.human, invite.token)).role, 'owner')
  await kernel.updateMember(a.human, b.human.userId, 'owner', 'operator')
  await assert.rejects(kernel.previewInvitation(c.human, invite.token))
  await assert.rejects(kernel.acceptInvitation(c.human, invite.token))
})
