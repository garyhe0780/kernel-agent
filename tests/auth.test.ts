import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuth } from '../src/lib/auth.server'
import { signupInvitationRejection } from '../src/lib/signup-invitation'
import { openTestDatabase } from './test-database'

const { db, close } = await openTestDatabase()
after(close)

test('signup invitation rejects missing, blank, and mismatched codes', () => {
  assert.equal(signupInvitationRejection('secret-code', ''), 'Kernel is invite-only. Ask an operator for an invitation code.')
  assert.equal(signupInvitationRejection('secret-code', '   '), 'Kernel is invite-only. Ask an operator for an invitation code.')
  assert.equal(signupInvitationRejection(undefined, 'secret-code'), 'That invitation code is not valid.')
  assert.equal(signupInvitationRejection('wrong', 'secret-code'), 'That invitation code is not valid.')
  assert.equal(signupInvitationRejection('other', 'secret'), 'That invitation code is not valid.')
  assert.equal(signupInvitationRejection('SECRET-CODE', 'secret-code'), null)
  assert.equal(signupInvitationRejection('  Secret-Code  ', 'SECRET-CODE'), null)
})

test('HTTP signup requires the configured invitation code and leaves sign-in open', async () => {
  process.env.BETTER_AUTH_SECRET ||= '0'.repeat(64)
  const previous = process.env.KERNEL_SIGNUP_CODE
  const auth = createAuth(db)
  const account = { name: 'Invitee', email: `invitee-${Date.now()}@example.test`, password: 'password-ok' }

  async function post(path: string, body: Record<string, unknown>) {
    return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }))
  }

  try {
    delete process.env.KERNEL_SIGNUP_CODE
    const closed = await post('/sign-up/email', account)
    assert.equal(closed.status, 403)
    assert.match(await closed.text(), /invite-only/)
    assert.equal(await db.user.findUnique({ where: { email: account.email } }), null)

    process.env.KERNEL_SIGNUP_CODE = 'closed-preview'
    const missing = await post('/sign-up/email', account)
    assert.equal(missing.status, 403)
    assert.match(await missing.text(), /not valid/)

    const wrong = await post('/sign-up/email', { ...account, invitationCode: 'nope' })
    assert.equal(wrong.status, 403)
    assert.equal(await db.user.findUnique({ where: { email: account.email } }), null)

    const created = await post('/sign-up/email', { ...account, invitationCode: ' CLOSED-PREVIEW ' })
    assert.equal(created.status, 200)
    assert.ok(await db.user.findUnique({ where: { email: account.email } }))

    await db.session.deleteMany({ where: { user: { email: account.email } } })
    const signedIn = await post('/sign-in/email', { email: account.email, password: account.password })
    assert.equal(signedIn.status, 200)

    delete process.env.KERNEL_SIGNUP_CODE
    const invitedEmail = `app-${Date.now()}@example.test`
    const token = 'b'.repeat(64)
    const workspace = await db.workspace.create({ data: { name: 'Invite workspace' } })
    const project = await db.project.create({ data: { workspaceId: workspace.id, slug: 'linear', name: 'Linear', shell: 'workbench', packages: ['work.issue'] } })
    await db.projectInvitation.create({ data: { projectId: project.id, email: invitedEmail, createdBy: 'owner', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } })
    const mismatched = await post('/sign-up/email', { name: 'Wrong', email: `other-${Date.now()}@example.test`, password: 'password-ok', applicationInvite: token })
    assert.equal(mismatched.status, 403)
    const joined = await post('/sign-up/email', { name: 'App User', email: invitedEmail, password: 'password-ok', applicationInvite: token })
    assert.equal(joined.status, 200)
    assert.ok(await db.user.findUnique({ where: { email: invitedEmail } }))
  } finally {
    if (previous === undefined) delete process.env.KERNEL_SIGNUP_CODE
    else process.env.KERNEL_SIGNUP_CODE = previous
  }
})

test('password recovery uses single-use expiring tokens and revokes sessions', async () => {
  process.env.BETTER_AUTH_SECRET ||= '0'.repeat(64)
  const previous = { key: process.env.RESEND_API_KEY, sender: process.env.KERNEL_EMAIL_FROM, invite: process.env.KERNEL_SIGNUP_CODE }
  const originalFetch = globalThis.fetch
  const sent: { to: string[]; text: string }[] = []
  const auth = createAuth(db)
  const email = `recovery-${Date.now()}@example.test`
  const post = (path: string, body: Record<string, unknown>) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body),
  }))
  try {
    process.env.KERNEL_SIGNUP_CODE = 'recovery-test'
    assert.equal((await post('/sign-up/email', { name: 'Recovery', email, password: 'original-password', invitationCode: 'recovery-test' })).status, 200)
    delete process.env.RESEND_API_KEY
    delete process.env.KERNEL_EMAIL_FROM
    assert.equal((await post('/request-password-reset', { email })).status, 503)
    assert.equal((await post('/request-password-reset', { email: 'unknown@example.test' })).status, 503)
    process.env.RESEND_API_KEY = 'test-key'
    process.env.KERNEL_EMAIL_FROM = 'Kernel <accounts@example.test>'
    globalThis.fetch = async (input, init) => {
      assert.equal(input, 'https://api.resend.com/emails')
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({ id: 'test-message' })
    }
    const redirectTo = 'http://localhost:3000/login?mode=reset'
    const known = await post('/request-password-reset', { email, redirectTo })
    const unknown = await post('/request-password-reset', { email: 'unknown@example.test', redirectTo })
    assert.equal(known.status, 200)
    assert.deepEqual(await known.json(), await unknown.json())
    assert.equal(sent.length, 1)
    assert.deepEqual(sent[0].to, [email])
    const link = sent[0].text.match(/http[^\s]+/)![0]
    const callback = await auth.handler(new Request(link))
    assert.equal(callback.status, 302)
    const token = new URL(callback.headers.get('location')!).searchParams.get('token')!
    assert.ok(token)
    assert.equal((await post('/reset-password', { token, newPassword: 'short' })).status, 400)
    assert.equal((await post('/reset-password', { token, newPassword: 'replacement-password' })).status, 200)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0)
    assert.equal((await post('/reset-password', { token, newPassword: 'another-password' })).status, 400)
    assert.equal((await post('/sign-in/email', { email, password: 'original-password' })).status, 401)
    assert.equal((await post('/sign-in/email', { email, password: 'replacement-password' })).status, 200)
    await post('/request-password-reset', { email, redirectTo })
    const expiredLink = sent[1].text.match(/http[^\s]+/)![0]
    const expiredToken = new URL(expiredLink).pathname.split('/').pop()!
    await db.verification.updateMany({ where: { identifier: `reset-password:${expiredToken}` }, data: { expiresAt: new Date(0) } })
    const expiredCallback = await auth.handler(new Request(expiredLink))
    assert.match(expiredCallback.headers.get('location')!, /error=INVALID_TOKEN/)
    assert.equal((await post('/reset-password', { token: expiredToken, newPassword: 'another-password' })).status, 400)
    assert.equal((await post('/request-password-reset', { email, redirectTo: 'https://untrusted.example/reset' })).status, 403)
    globalThis.fetch = async () => new Response('provider failure', { status: 500 })
    assert.equal((await post('/request-password-reset', { email, redirectTo })).status, 200)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries({ RESEND_API_KEY: previous.key, KERNEL_EMAIL_FROM: previous.sender, KERNEL_SIGNUP_CODE: previous.invite })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
