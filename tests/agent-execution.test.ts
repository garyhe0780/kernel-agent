import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { openTestDatabase } from './test-database'
import { Kernel } from '../src/kernel/engine.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import { CREATE_ACTION } from '../src/kernel/record-operations'
import { handleMcp } from '../src/lib/mcp.server'
import { handleAgentCredential } from '../src/lib/agent-api.server'
import type { Principal, RecordData } from '../src/kernel/definition'

const { db, close } = await openTestDatabase()
after(close)
const kernel = new Kernel(db), access = new AgentAccess(db)
let sequence = 0
async function fixture(execution?: 'review' | 'automatic') {
  const user = await db.user.create({ data: { id: `auto-${++sequence}`, name: 'Owner', email: `auto-${sequence}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const human: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const draft = await kernel.saveDraft(human, { brief: 'Automatic sales operation tests', pattern: 'crm', source: 'manual' })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  const capability = `${slug}__opportunities`
  const customer = await kernel.createRecord(human, { title: 'Customer account' }, `${slug}__customers`)
  const input = { title: 'Qualified opportunity', source: 'Inbound', customer: customer.id }
  const credential = await access.create(human, { project: slug, name: 'Sales agent', expiresInDays: 30, actions: [CREATE_ACTION, 'open', 'convert'].map(action => ({ capability, action, version: 1, ...(execution ? { execution } : {}) })) })
  const agent = await access.authenticate(credential.token)
  return { human, agent, credential, slug, capability, input, customer }
}
async function connect(token: string) {
  const client = new Client({ name: 'automatic-test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel) }))
  return client
}

test('automatic creation and action execute once through MCP and HTTP with honest audit attribution', async () => {
  const f = await fixture('automatic'), client = await connect(f.credential.token)
  try {
    const tools = (await client.listTools()).tools
    const create = tools.find(tool => tool.name.startsWith('execute_create_'))!
    assert.ok(create)
    assert.ok(tools.some(tool => tool.name.startsWith('stage_create_')))
    const args = { input: f.input, idempotencyKey: 'automatic-create-once' }
    const results = await Promise.all([client.callTool({ name: create.name, arguments: args }), client.callTool({ name: create.name, arguments: args })])
    for (const result of results) assert.equal(result.isError, false, JSON.stringify(result.structuredContent))
    const first = results[0].structuredContent as { status: string; change: { id: string; recordId: string; executionMode: string; reviewedBy: string | null; reviewedAt: string | null } }
    assert.equal(first.status, 'applied')
    assert.equal(first.change.executionMode, 'automatic')
    assert.equal(first.change.reviewedBy, null)
    assert.equal(first.change.reviewedAt, null)
    assert.equal((results[1].structuredContent as typeof first).change.id, first.change.id)
    assert.equal(await db.businessRecord.count({ where: { id: first.change.recordId } }), 1)
    const event = await db.execution.findFirstOrThrow({ where: { changeId: first.change.id, outcome: 'applied' } })
    assert.equal(event.actorKind, 'agent')
    assert.equal(event.actorName, 'Sales agent')
    assert.equal((event.details as Record<string, unknown>).agentCredentialId, f.credential.credential.id)
    assert.equal(await db.execution.count({ where: { changeId: first.change.id, outcome: 'applied' } }), 1)
    const open = tools.find(tool => tool.name.startsWith('execute_') && tool.title?.endsWith(': open'))!
    assert.ok(open)
    const opened = await client.callTool({ name: open.name, arguments: { recordId: first.change.recordId, input: {}, idempotencyKey: 'automatic-open-once' } })
    assert.equal(opened.isError, false)
    const repeated = await client.callTool({ name: open.name, arguments: { recordId: first.change.recordId, input: {}, idempotencyKey: 'automatic-open-once' } })
    assert.equal((repeated.structuredContent as { change: { id: string } }).change.id, (opened.structuredContent as { change: { id: string } }).change.id)
    const response = await handleAgentCredential(new Request('http://localhost/api/agent', { method: 'POST', headers: { Authorization: `Bearer ${f.credential.token}` }, body: JSON.stringify({ type: 'execute', operation: 'action', capability: f.capability, recordId: first.change.recordId, action: 'convert', input: {}, idempotencyKey: 'http-auto-convert' }) }), access, kernel)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).status, 'applied')
    assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: first.change.recordId } })).data as RecordData).status, 'converted')
    assert.equal((await kernel.inbox(f.human)).length, 0)
    await assert.rejects(kernel.review(f.agent, first.change.id, 'apply'))
  } finally { await client.close() }
})

test('legacy grants default to review and automatic credentials can still explicitly stage', async () => {
  const f = await fixture(), client = await connect(f.credential.token)
  try {
    assert.ok(!(await client.listTools()).tools.some(tool => tool.name.startsWith('execute_')))
    await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: f.input, idempotencyKey: 'legacy-denied' }), /Human review/)
    assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 0)
    const staged = await kernel.stageCreate(f.agent, { capability: f.capability, input: f.input, idempotencyKey: 'legacy-staging' })
    assert.equal(staged.change.executionMode, 'review')
    assert.equal(await db.businessRecord.count({ where: { id: staged.change.recordId } }), 0)
    await kernel.review(f.human, staged.change.id, 'apply')
  } finally { await client.close() }
  const a = await fixture('automatic')
  const command = { capability: a.capability, input: a.input, idempotencyKey: 'explicit-review' }
  const staged = await kernel.stageCreate(a.agent, command)
  assert.equal(staged.change.status, 'pending')
  await assert.rejects(kernel.executeAgent(a.agent, { ...command, operation: 'create' }), /different proposal/)
  assert.equal(await db.businessRecord.count({ where: { id: staged.change.recordId } }), 0)
})

test('automatic execution enforces business policies, scope, relationships and payload identity', async () => {
  const f = await fixture('automatic'), other = await fixture('automatic')
  const created = await kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: f.input, idempotencyKey: 'auto-for-policy' })
  const recordId = created.change!.recordId
  const blocked = await kernel.executeAgent(f.agent, { operation: 'action', capability: f.capability, recordId, action: 'convert', input: {}, idempotencyKey: 'convert-before-open' })
  assert.equal(blocked.status, 'blocked')
  assert.equal(((await db.businessRecord.findUniqueOrThrow({ where: { id: recordId } })).data as RecordData).status, 'draft')
  assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId, idempotencyKey: 'convert-before-open' } }), 0)
  await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: { ...f.input, customer: other.customer.id }, idempotencyKey: 'foreign-reference' }))
  await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: { ...f.input, title: 'Changed' }, idempotencyKey: 'auto-for-policy' }), /different proposal/)
  await assert.rejects(kernel.executeAgent(other.agent, { operation: 'action', capability: f.capability, recordId, action: 'open', input: {}, idempotencyKey: 'cross-workspace' }))
  await assert.rejects(kernel.executeAgent(f.agent, { operation: 'action', capability: f.capability, recordId, action: 'lose', input: {}, idempotencyKey: 'ungranted-action' }), /scope/)
  await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: f.input, idempotencyKey: 'forged-policy', execution: 'automatic' }))
})

test('automatic grants require owner authorization and current credential and definition versions', async () => {
  for (const reason of ['revoke', 'expiry', 'owner', 'version']) {
    const f = await fixture('automatic')
    const operator = { ...f.human, role: 'operator' }
    await assert.rejects(access.create(operator, { project: f.slug, name: 'Cannot grant', expiresInDays: 30, actions: [{ capability: f.capability, action: CREATE_ACTION, version: 1, execution: 'automatic' }] }))
    const builder = await access.create(f.human, { kind: 'construct', name: 'Builder', expiresInDays: 30 })
    await assert.rejects(kernel.executeAgent(await access.authenticate(builder.token), { operation: 'create', capability: f.capability, input: f.input, idempotencyKey: 'builder-not-operator' }))
    if (reason === 'revoke') await access.revoke(f.human, f.credential.credential.id)
    if (reason === 'expiry') await db.agentCredential.update({ where: { id: f.credential.credential.id }, data: { expiresAt: new Date(0) } })
    if (reason === 'owner') await db.membership.updateMany({ where: { workspaceId: f.human.workspaceId }, data: { role: 'operator' } })
    if (reason === 'version') await db.capability.updateMany({ where: { workspaceId: f.human.workspaceId, slug: f.capability }, data: { version: 2 } })
    await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: f.input, idempotencyKey: `no-write-${reason}` }))
    assert.equal(await db.businessRecord.count({ where: { workspaceId: f.human.workspaceId, capability: f.capability } }), 0)
    assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 0)
  }
  const f = await fixture()
  await assert.rejects(access.create(f.human, { project: f.slug, name: 'Ambiguous', expiresInDays: 30, actions: [{ capability: f.capability, action: 'open', version: 1 }, { capability: f.capability, action: 'open', version: 1, execution: 'automatic' }] }), /duplicate/)
})

test('an execution failure rolls back the receipt, business record and audit together', async () => {
  const f = await fixture('automatic')
  await db.$executeRawUnsafe(`ALTER TABLE "BusinessRecord" ADD CONSTRAINT "auto_test_failure" CHECK (data->>'title' <> 'Fail automatic insert')`)
  try {
    await assert.rejects(kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: { ...f.input, title: 'Fail automatic insert' }, idempotencyKey: 'automatic-rollback' }))
    assert.equal(await db.businessRecord.count({ where: { capability: f.capability, workspaceId: f.human.workspaceId } }), 0)
    assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 0)
    assert.equal(await db.execution.count({ where: { workspaceId: f.human.workspaceId, action: `${f.capability}.${CREATE_ACTION}` } }), 0)
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE "BusinessRecord" DROP CONSTRAINT "auto_test_failure"')
  }
  const retry = await kernel.executeAgent(f.agent, { operation: 'create', capability: f.capability, input: { ...f.input, title: 'Fail automatic insert' }, idempotencyKey: 'automatic-rollback' })
  assert.equal(retry.status, 'applied')
})
