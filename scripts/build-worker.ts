import { Kernel } from '../src/kernel/engine.server'
import 'dotenv/config'
import { openDatabase } from '../src/lib/db.server'
import { BuildJobs } from '../src/kernel/build-jobs.server'
const db = await openDatabase()
const jobs = new BuildJobs(db)
const kernel = new Kernel(db)
let stopping = false
process.on('SIGTERM', () => { stopping = true })
process.on('SIGINT', () => { stopping = true })
while (!stopping) {
  try { await jobs.runOne(); await kernel.pollAgentRuns() } catch (error) { console.error('Build worker poll failed:', error instanceof Error ? error.name : 'Unknown error') }
  if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000))
}
await db.$disconnect()
