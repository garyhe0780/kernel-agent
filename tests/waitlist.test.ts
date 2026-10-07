import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { handleWaitlist } from '../src/lib/waitlist.server'
import { openTestDatabase } from './test-database'

const { db, close } = await openTestDatabase()
after(close)
const getDatabase = async () => db
const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://kernel.example/api/waitlist', {
  method: 'POST', headers: { origin: 'https://kernel.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
})

test('anonymous signup persists a normalized email and retries keep the original entry', async () => {
  const first = await handleWaitlist(post({ email: '  Interested@Example.com  ' }), getDatabase)
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { joined: true })
  assert.equal(first.headers.get('cache-control'), 'no-store')
  const original = await db.waitlistEntry.findUniqueOrThrow({ where: { email: 'interested@example.com' } })
  assert.ok(original.createdAt instanceof Date)
  const retries = await Promise.all(Array.from({ length: 3 }, () => handleWaitlist(post({ email: 'INTERESTED@example.com' }), getDatabase)))
  for (const response of retries) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { joined: true })
  }
  assert.equal(await db.waitlistEntry.count({ where: { email: original.email } }), 1)
  assert.deepEqual(await db.waitlistEntry.findUnique({ where: { email: original.email } }), original)
  assert.equal(await db.user.count(), 0)
})

test('invalid submissions never open the database', async () => {
  const neverOpen = async () => { throw new Error('Database should not be opened') }
  for (const body of [{ email: '' }, { email: 'not-an-email' }, { email: 'a'.repeat(255) + '@example.com' }, { email: 42 }, {}, null, { email: 'ok@example.com', role: 'owner' }]) {
    const response = await handleWaitlist(post(body), neverOpen)
    assert.equal(response.status, 400)
  }
  assert.equal((await handleWaitlist(new Request('https://kernel.example/api/waitlist', { method: 'POST', headers: { origin: 'https://kernel.example', 'content-type': 'application/json' }, body: '{' }), neverOpen)).status, 400)
})

test('public signup rejects cross-origin writes, unsupported formats, and oversized bodies', async () => {
  const neverOpen = async () => { throw new Error('Database should not be opened') }
  assert.equal((await handleWaitlist(post({ email: 'ok@example.com' }, { origin: 'https://other.example' }), neverOpen)).status, 403)
  assert.equal((await handleWaitlist(post({ email: 'ok@example.com' }, { origin: '' }), neverOpen)).status, 403)
  assert.equal((await handleWaitlist(post({ email: 'ok@example.com' }, { 'content-type': 'text/plain' }), neverOpen)).status, 415)
  assert.equal((await handleWaitlist(post({ email: 'x'.repeat(3000) }), neverOpen)).status, 413)
  const response = await handleWaitlist(new Request('https://kernel.example/api/waitlist'), neverOpen)
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST')
})

test('database failures return a retryable error without disclosing internals', async () => {
  const response = await handleWaitlist(post({ email: 'failure@example.com' }), async () => { throw new Error('private connection details') })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'We couldn’t save your email. Please try again.' })
})
