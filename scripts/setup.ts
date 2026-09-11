import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

if (!existsSync('.env')) {
  writeFileSync('.env', `DATABASE_URL="file:./kernel.db"\nBETTER_AUTH_URL="http://localhost:3000"\nBETTER_AUTH_SECRET="${randomBytes(32).toString('hex')}"\n`, { mode: 0o600 })
  console.log('Created local environment with a random authentication secret.')
} else {
  console.log('Preserved existing .env.')
}
