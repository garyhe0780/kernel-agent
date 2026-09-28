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
const kernel = new Kernel(db)
const access = new AgentAccess(db)
let sequence = 0
async function fixture(pattern = 'crm') {
  const user = await db.user.create({ data: { id: `creation-${++sequence}`, name: 'Owner', email: `creation-${sequence}@example.test` } })
  const member = await kernel.ensureWorkspace(user)
  const human: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const draft = await kernel.saveDraft(human, { brief: 'Reviewed agent creation acceptance', source: 'manual', pattern })
  const { slug } = await kernel.publishDraft(human, draft.id, draft.version)
  const capability = `${slug}__${pattern === 'crm' ? 'opportunities' : 'issues'}`
  const referenceCapability = `${slug}__${pattern === 'crm' ? 'customers' : 'projects'}`
  const reference = await kernel.createRecord(human, { title: 'Reference record' }, referenceCapability)
  const input = pattern === 'crm' ? { title: 'New opportunity', customer: reference.id, source: 'Inbound' } : { title: 'New project issue', project: reference.id }
  const credential = await access.create(human, { project: slug, name: 'Creator', expiresInDays: 30, actions: [{ capability, action: CREATE_ACTION, version: 1 }] })
  const agent = await access.authenticate(credential.token)
  return { human, agent, credential, capability, referenceCapability, reference, input, slug }
}
async function client(token: string) {
  const result = new Client({ name: 'creation-acceptance', version: '1' })
  await result.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (url, init) => handleMcp(new Request(url, init), access, kernel),
  }))
  return result
}
const api = (token: string, body: unknown) => handleAgentCredential(new Request('http://localhost/api/agent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), access, kernel)

for (const pattern of ['crm', 'issues']) test(`${pattern}: MCP creation remains a proposal until one human approval`, async () => {
  const f = await fixture(pattern)
  const connection = await client(f.credential.token)
  try {
    const tools = (await connection.listTools()).tools
    const creation = tools.find(tool => tool.name.startsWith('stage_create_'))!
    assert.ok(creation)
    assert.ok(!JSON.stringify(creation.inputSchema).includes('"status"'))
    const args = { input: f.input, idempotencyKey: 'create-record-once' }
    const reply = await connection.callTool({ name: creation.name, arguments: args })
    assert.equal(reply.isError, false, JSON.stringify(reply.structuredContent))
    const change = (reply.structuredContent as { change: { id: string; kind: string; recordId: string } }).change
    assert.equal(change.kind, 'create')
    assert.equal(await db.businessRecord.count({ where: { id: change.recordId } }), 0)
    const repeated = await connection.callTool({ name: creation.name, arguments: args })
    assert.equal((repeated.structuredContent as { change: { id: string } }).change.id, change.id)
    const inbox = await kernel.inbox(f.human)
    assert.equal(inbox.find(item => item.id === change.id)?.title, f.input.title)
    assert.equal(inbox.find(item => item.id === change.id)?.stale, false)
    const state = await kernel.snapshot(f.human, f.slug)
    assert.ok(state.executions.some(event => event.changeId === change.id))
    await assert.rejects(kernel.review(f.agent, change.id, 'apply'))
    const concurrent = await Promise.allSettled([kernel.review(f.human, change.id, 'apply'), kernel.review(f.human, change.id, 'apply')])
    assert.ok(concurrent.some(result => result.status === 'fulfilled'))
    assert.equal((await kernel.review(f.human, change.id, 'apply')).repeated, true)
    assert.equal(await db.businessRecord.count({ where: { id: change.recordId } }), 1)
    assert.equal(await db.execution.count({ where: { changeId: change.id, outcome: 'applied' } }), 1)
    const record = await db.businessRecord.findUniqueOrThrow({ where: { id: change.recordId } })
    assert.equal((record.data as RecordData).status, pattern === 'crm' ? 'draft' : 'backlog')
    const retried = await connection.callTool({ name: creation.name, arguments: args })
    assert.equal((retried.structuredContent as { status: string }).status, 'applied')
    const queried = await connection.callTool({ name: 'query_records', arguments: { capability: f.capability, filters: [{ field: pattern === 'crm' ? 'customer' : 'project', value: f.reference.id }], title: 'New', limit: 1 } })
    assert.equal(queried.isError, false, JSON.stringify(queried.structuredContent))
    assert.equal((queried.structuredContent as { records: { id: string }[] }).records[0].id, record.id)
    const status = await connection.callTool({ name: 'get_proposal', arguments: { changeId: change.id } })
    assert.equal((status.structuredContent as { change: { status: string } }).change.status, 'applied')
  } finally { await connection.close() }
})

test('creation retries are atomic, payload-bound and credential-bound; rejection creates nothing', async () => {
  const f = await fixture()
  const command = { capability: f.capability, input: f.input, idempotencyKey: 'parallel-creation' }
  const [a, b] = await Promise.all([kernel.stageCreate(f.agent, command), kernel.stageCreate(f.agent, command)])
  assert.equal(a.change.id, b.change.id)
  await assert.rejects(kernel.stageCreate(f.agent, { ...command, input: { ...f.input, title: 'Changed payload' } }), /different proposal/)
  const other = await access.create(f.human, { project: f.slug, name: 'Other creator', expiresInDays: 30, actions: [{ capability: f.capability, action: CREATE_ACTION, version: 1 }] })
  await assert.rejects(kernel.stageCreate(await access.authenticate(other.token), command), /different proposal/)
  await kernel.review(f.human, a.change.id, 'reject')
  assert.equal((await kernel.stageCreate(f.agent, command)).status, 'rejected')
  assert.equal(await db.businessRecord.count({ where: { id: a.change.recordId } }), 0)
})

test('creation scope, fields, references and builder isolation are enforced before persistence', async () => {
  const f = await fixture(), foreign = await fixture()
  const command = { capability: f.capability, input: f.input, idempotencyKey: 'invalid-create' }
  const actionOnly = await access.create(f.human, { project: f.slug, name: 'Action only', expiresInDays: 30, actions: [{ capability: f.capability, action: 'open', version: 1 }] })
  await assert.rejects(kernel.stageCreate(await access.authenticate(actionOnly.token), command), /scope/)
  const builder = await access.create(f.human, { kind: 'construct', name: 'Builder', expiresInDays: 30 })
  await assert.rejects(kernel.stageCreate(await access.authenticate(builder.token), command))
  await assert.rejects(kernel.queryRecords(await access.authenticate(builder.token), { capability: f.capability }))
  for (const input of [{ ...f.input, status: 'converted' }, { ...f.input, unknown: true }, { ...f.input, source: 42 }, { ...f.input, customer: foreign.reference.id }]) {
    await assert.rejects(kernel.stageCreate(f.agent, { ...command, input }))
  }
  await assert.rejects(kernel.stageCreate(f.agent, { ...command, capability: f.referenceCapability, input: { title: 'Unauthorized customer' } }), /scope/)
  assert.equal(await db.changeSet.count({ where: { workspaceId: f.human.workspaceId } }), 0)
})

test('creation review rechecks revocation, expiry, ownership, definitions and references', async () => {
  for (const reason of ['revoke', 'expire', 'owner', 'definition', 'reference']) {
    const f = await fixture()
    const { change } = await kernel.stageCreate(f.agent, { capability: f.capability, input: f.input, idempotencyKey: `review-${reason}` })
    if (reason === 'revoke') await access.revoke(f.human, f.credential.credential.id)
    if (reason === 'expire') await db.agentCredential.update({ where: { id: f.credential.credential.id }, data: { expiresAt: new Date(0) } })
    if (reason === 'owner') await db.membership.updateMany({ where: { userId: f.human.userId }, data: { role: 'operator' } })
    if (reason === 'definition') await db.capability.updateMany({ where: { workspaceId: f.human.workspaceId, slug: f.capability }, data: { version: { increment: 1 } } })
    if (reason === 'reference') await db.businessRecord.delete({ where: { id: f.reference.id } })
    await assert.rejects(kernel.review(f.human, change.id, 'apply'))
    assert.equal((await db.changeSet.findUniqueOrThrow({ where: { id: change.id } })).status, 'pending')
    assert.equal(await db.businessRecord.count({ where: { id: change.recordId } }), 0)
    if (reason === 'owner') await db.membership.updateMany({ where: { userId: f.human.userId }, data: { role: 'owner' } })
    await kernel.review(f.human, change.id, 'reject')
  }
})

test('targeted queries page matching live records and bind cursors to credential, entity and filters', async () => {
  const f = await fixture(), foreign = await fixture()
  for (const title of ['Match one', 'Other name', 'Match two', 'Match three']) await kernel.createRecord(f.human, { ...f.input, title }, f.capability)
  const query = { capability: f.capability, title: 'Match', filters: [{ field: 'source', value: 'Inbound' }], limit: 1 }
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await kernel.queryRecords(f.agent, { ...query, cursor })
    assert.equal(page.records.length, 1)
    ids.push(page.records[0].id)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  assert.equal(new Set(ids).size, 3)
  const page = await kernel.queryRecords(f.agent, query)
  await assert.rejects(kernel.queryRecords(f.agent, { ...query, title: 'Other', cursor: page.nextCursor }))
  await assert.rejects(kernel.queryRecords(f.agent, { ...query, capability: f.referenceCapability, cursor: page.nextCursor }))
  await assert.rejects(kernel.queryRecords(foreign.agent, { ...query, cursor: page.nextCursor }))
  for (const invalid of [{ ...query, limit: 101 }, { ...query, filters: [{ field: 'missing', value: 'x' }] }, { ...query, filters: [{ field: 'source', value: 1 }] }, { ...query, workspaceId: foreign.human.workspaceId }]) await assert.rejects(kernel.queryRecords(f.agent, invalid))
  assert.equal((await api(f.credential.token, { type: 'query_records', ...query })).status, 200)
  const staged = await api(f.credential.token, { type: 'stage_create', capability: f.capability, input: f.input, idempotencyKey: 'http-creation' })
  assert.equal(staged.status, 200)
  assert.equal((await staged.json()).change.kind, 'create')
  await access.revoke(f.human, f.credential.credential.id)
  await assert.rejects(kernel.queryRecords(f.agent, query))
})
