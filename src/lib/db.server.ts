import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { postgresConnectionString, usesEmbeddedPostgres } from './env.server'

export function createPostgresClient(connectionString = postgresConnectionString()) {
  if (!connectionString.startsWith('postgres')) throw new Error('Set DATABASE_URL to a PostgreSQL connection string, or configure Hyperdrive.')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })
}

export async function openDatabase() {
  if (typeof __KERNEL_CLOUDFLARE__ !== 'undefined' && __KERNEL_CLOUDFLARE__) return createPostgresClient()
  if (usesEmbeddedPostgres()) {
    const { openEmbeddedPostgres } = await import('./db-pglite.server')
    return openEmbeddedPostgres()
  }
  return createPostgresClient()
}
