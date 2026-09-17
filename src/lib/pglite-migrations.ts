import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PGlite } from '@electric-sql/pglite'

export function kernelMigrationFiles() {
  const root = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))
  return readdirSync(root).filter(name => /^\d/.test(name)).sort().map(name => ({
    name,
    sql: readFileSync(join(root, name, 'migration.sql'), 'utf8'),
  }))
}

export async function applyPgliteMigrations(pg: PGlite) {
  await pg.exec('CREATE TABLE IF NOT EXISTS _kernel_migrations (name TEXT PRIMARY KEY)')
  for (const file of kernelMigrationFiles()) {
    const { rows } = await pg.query<{ name: string }>('SELECT name FROM _kernel_migrations WHERE name = $1', [file.name])
    if (rows.length) continue
    await pg.exec(file.sql)
    await pg.query('INSERT INTO _kernel_migrations (name) VALUES ($1)', [file.name])
  }
}
