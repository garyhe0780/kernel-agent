import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PrismaPGlite } from 'pglite-prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { applyPgliteMigrations } from './pglite-migrations'
import { runtimeEnv } from './env.server'

export async function openEmbeddedPostgres() {
  const dir = runtimeEnv().KERNEL_PGLITE_DIR?.trim() || '.data/kernel'
  mkdirSync(dirname(dir), { recursive: true })
  const pg = new PGlite(dir)
  await applyPgliteMigrations(pg)
  return new PrismaClient({ adapter: new PrismaPGlite(pg) as never })
}
