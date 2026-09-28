import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PGlite } from '@electric-sql/pglite'
import { PrismaPGlite } from 'pglite-prisma-adapter'
import { PrismaClient } from '@prisma/client'

// Stop the preview before running: embedded databases must have one process owner.
const manifest = JSON.parse(await readFile(join(tmpdir(), 'kernel-browser-acceptance.json'), 'utf8'))
assert.ok(resolve(manifest.database).startsWith(resolve(tmpdir()) + '/kernel-browser-acceptance-'))
const pg = new PGlite(manifest.database)
const db = new PrismaClient({ adapter: new PrismaPGlite(pg) as never })
try {
  const journeys = []
  for (const app of manifest.applications) {
    const capability = `${app.slug}__${app.pattern === 'crm' ? 'opportunities' : 'issues'}`
    const records = await db.businessRecord.findMany({ where: { workspaceId: manifest.workspaceId, capability } })
    assert.equal(records.length, 1)
    const record = records[0]
    const finalStatus = app.pattern === 'crm' ? 'converted' : 'done'
    assert.equal((record.data as { status: string }).status, finalStatus)
    const receipts = await db.changeSet.findMany({ where: { recordId: record.id }, orderBy: { createdAt: 'asc' } })
    assert.equal(receipts.length, 3)
    assert.deepEqual(receipts.map(c => c.status), ['applied', 'applied', 'applied'])
    assert.deepEqual(receipts.map(c => c.executionMode), ['review', 'automatic', 'review'])
    assert.ok(receipts[0].reviewedBy && receipts[2].reviewedBy)
    assert.equal(receipts[1].reviewedBy, null)
    const runs = await db.agentRun.findMany({ where: { agentCredentialId: receipts[0].agentCredentialId! } })
    assert.equal(runs.length, 1)
    assert.equal(runs[0].status, 'completed')
    assert.equal(runs[0].nextStep, 3)
    const events = await db.execution.findMany({ where: { recordId: record.id, outcome: 'applied' }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(events.map(e => e.actorKind), ['human', 'agent', 'human'])
    journeys.push({ pattern: app.pattern, finalStatus, records: records.length, runStatus: runs[0].status, completedSteps: 3, executionModes: receipts.map(c => c.executionMode), auditActors: events.map(e => e.actorKind) })
  }
  const report = { verifiedAt: new Date().toISOString(), mode: 'signed-in-browser-live-model', status: 'passed', journeys }
  await writeFile('validation/agent-acceptance/signed-in-database.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await db.$disconnect(); await pg.close() }
