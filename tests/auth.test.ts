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
  } finally {
    if (previous === undefined) delete process.env.KERNEL_SIGNUP_CODE
    else process.env.KERNEL_SIGNUP_CODE = previous
  }
})
