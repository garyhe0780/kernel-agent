import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { Prisma } from '@prisma/client'
import pg from 'pg'

// Explicit production file only. Never falls back to the local development DB.
async function main() {
  const env = parse(await readFile(resolve(process.argv[2] ?? '.env.deploy'), 'utf8'))
  if (!env.DATABASE_URL?.startsWith('postgres')) throw new Error('Configuration missing')
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15_000, statement_timeout: 15_000 })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const columns = await client.query<{ table_name: string; column_name: string }>('SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()')
    const actual = new Map<string, Set<string>>()
    for (const row of columns.rows) {
      if (!actual.has(row.table_name)) actual.set(row.table_name, new Set())
      actual.get(row.table_name)!.add(row.column_name)
    }
    const missingTables: string[] = [], missingColumns: { table: string; column: string }[] = []
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName ?? model.name
      if (!actual.has(table)) { missingTables.push(table); continue }
      for (const field of model.fields) if (field.kind !== 'object') {
        const column = field.dbName ?? field.name
        if (!actual.get(table)!.has(column)) missingColumns.push({ table, column })
      }
    }
    const expected = (await readdir(resolve('prisma/migrations'))).filter(name => /^\d/.test(name)).sort()
    const applied = actual.has('_prisma_migrations') ? (await client.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')).rows : []
    const completed = new Set(applied.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name))
    const unappliedMigrations = expected.filter(name => !completed.has(name))
    const report = { checkedAt: new Date().toISOString(), mode: 'read-only', missingTables, missingColumns, migrationHistoryPresent: actual.has('_prisma_migrations'), unappliedMigrations,
      status: missingTables.length || missingColumns.length || unappliedMigrations.length ? 'needs-attention' : 'expected-tables-and-columns-present',
      scope: 'Presence of expected tables/columns and completed migration names only; types, constraints, indexes, checksums, and data compatibility require separate migration review.' }
    await client.query('ROLLBACK')
    await mkdir(resolve('validation/production'), { recursive: true })
    await writeFile(resolve('validation/production/schema-check.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify(report, null, 2))
    if (report.status === 'needs-attention') process.exitCode = 1
  } finally { await client.end() }
}
main().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{2,12}$/.test(error.code) ? ` (${error.code})` : ''
  console.error(`Schema check could not complete${code}. Check .env.deploy and database connectivity. No connection details or raw error messages are logged.`)
  process.exitCode = 1
})
