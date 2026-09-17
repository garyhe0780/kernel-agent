import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { openDatabase } from '../src/lib/db.server'
import { usesEmbeddedPostgres } from '../src/lib/env.server'

if (usesEmbeddedPostgres()) {
  const db = await openDatabase()
  await db.$disconnect()
  console.log('Applied embedded Postgres migrations.')
} else {
  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env })
  process.exit(result.status ?? 1)
}
