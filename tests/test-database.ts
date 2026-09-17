import { PGlite } from '@electric-sql/pglite'
import { PrismaPGlite } from 'pglite-prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { applyPgliteMigrations } from '../src/lib/pglite-migrations'

export async function openTestDatabase() {
  const pg = new PGlite()
  await applyPgliteMigrations(pg)
  const db = new PrismaClient({ adapter: new PrismaPGlite(pg) as never })
  return { db, async close() { await db.$disconnect(); await pg.close() } }
}
