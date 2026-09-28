import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { modelStatus } from '../src/kernel/model.server'
import { scopedJourney } from '../tests/acceptance/scoped-journeys'

const live = process.argv.includes('--live')
const report = { startedAt: new Date().toISOString(), mode: live ? 'live' : 'deterministic', model: live ? modelStatus().model : null, journeys: [] as unknown[], status: 'running', failure: null as string | null }
try {
  if (live && !modelStatus().configured) throw new Error('Configure the provider key and model before live acceptance.')
  for (const pattern of ['crm', 'issues'] as const) {
    console.log(`RUN ${pattern} (${report.mode}); isolated synthetic database`)
    const result = await scopedJourney(pattern, live)
    report.journeys.push(result)
    for (const check of result.checks) console.log(`PASS ${pattern}: ${check}`)
  }
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = error instanceof Error ? error.message.slice(0, 1000) : 'Acceptance failed'
  console.error(report.failure)
  process.exitCode = 1
} finally {
  const path = join(tmpdir(), `kernel-agent-acceptance-${report.mode}.json`)
  await writeFile(path, JSON.stringify(report, null, 2) + '\n')
  console.log(`Report: ${path}`)
}
