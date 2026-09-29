import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import pg from 'pg'

/** Fallback for environments where Prisma's schema-engine transport fails.
 * Existing history is required; SQL and history updates commit atomically. */
async function main() {
  if (process.argv[2] !== '--apply' || !process.argv[3]) throw new Error('Explicit apply and connection file required')
  const env = parse(await readFile(resolve(process.argv[3]), 'utf8'))
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 20000, statement_timeout: 60000 })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '15s'")
    await client.query('LOCK TABLE "_prisma_migrations" IN EXCLUSIVE MODE')
    const { rows } = await client.query<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"')
    const root = resolve('prisma/migrations')
    const completed = new Set<string>()
    for (const row of rows) {
      if (row.rolled_back_at) continue
      if (!row.finished_at) throw new Error('Unfinished migration')
      const checksum = createHash('sha256').update(await readFile(resolve(root, row.migration_name, 'migration.sql'))).digest('hex')
      if (checksum !== row.checksum) throw new Error('Checksum mismatch')
      completed.add(row.migration_name)
    }
    const applied: string[] = []
    for (const name of (await readdir(root)).filter(name => /^\d/.test(name)).sort()) {
      if (completed.has(name)) continue
      const sql = await readFile(resolve(root, name, 'migration.sql'), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      await client.query(sql)
      await client.query('INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)', [randomUUID(), checksum, name])
      applied.push(name)
    }
    await client.query('COMMIT')
    console.log(JSON.stringify({ status: 'committed', applied }, null, 2))
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { await client.end() }
}
main().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9]{2,12}$/.test(error.code) ? error.code : undefined
  console.error(JSON.stringify({ status: 'not-confirmed', code, message: 'Migration did not report a successful commit. Inspect schema/history before retrying. No raw error details logged.' }))
  process.exitCode = 1
})
