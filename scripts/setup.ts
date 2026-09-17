import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const secret = randomBytes(32).toString('hex')
const signupCode = randomBytes(6).toString('hex')
const localEnv = `DATABASE_URL="postgresql://kernel:kernel@127.0.0.1:5432/kernel"
KERNEL_PGLITE=1
KERNEL_PGLITE_DIR=".data/kernel"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="${secret}"
KERNEL_SIGNUP_CODE="${signupCode}"
`

if (!existsSync('.env')) {
  writeFileSync('.env', localEnv, { mode: 0o600 })
  console.log('Created local environment with embedded Postgres, a random authentication secret, and a signup invitation code.')
} else {
  let current = readFileSync('.env', 'utf8')
  let changed = false
  let addedSignupCode = false
  if (/^DATABASE_URL="?file:/m.test(current)) {
    current = current.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL="postgresql://kernel:kernel@127.0.0.1:5432/kernel"')
    changed = true
  }
  if (!/^KERNEL_PGLITE=/m.test(current)) {
    current = `${current.trim()}\nKERNEL_PGLITE=1\nKERNEL_PGLITE_DIR=".data/kernel"\n`
    changed = true
  }
  if (!/^KERNEL_SIGNUP_CODE=/m.test(current)) {
    current = `${current.trim()}\nKERNEL_SIGNUP_CODE="${randomBytes(6).toString('hex')}"\n`
    changed = true
    addedSignupCode = true
  }
  if (changed) {
    writeFileSync('.env', current.endsWith('\n') ? current : `${current}\n`, { mode: 0o600 })
    console.log(addedSignupCode
      ? 'Updated .env. Signup is invite-only; share KERNEL_SIGNUP_CODE from this file.'
      : 'Updated .env for embedded Postgres. Existing kernel.db is unchanged; local data now lives in .data/kernel.')
  } else {
    console.log('Preserved existing .env.')
  }
}
