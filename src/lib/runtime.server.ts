import { AgentAccess } from '../kernel/agent-access.server'
import { BuildJobs, startBuildWorker } from '../kernel/build-jobs.server'
import { Kernel } from '../kernel/engine.server'
import { createAuth } from './auth.server'
import { openDatabase } from './db.server'
import { isCloudflareWorker, runtimeEnv } from './env.server'

type Runtime = {
  db: Awaited<ReturnType<typeof openDatabase>>
  kernel: Kernel
  buildJobs: BuildJobs
  agentAccess: AgentAccess
  auth: ReturnType<typeof createAuth>
}

const cache = globalThis as unknown as { kernelRuntime?: Promise<Runtime>; stopKernelBuildWorker?: () => void }

async function createRuntime(): Promise<Runtime> {
  const db = await openDatabase()
  const buildJobs = new BuildJobs(db)
  if (!isCloudflareWorker()) {
    cache.stopKernelBuildWorker?.()
    cache.stopKernelBuildWorker = startBuildWorker(buildJobs)
  }
  return { db, kernel: new Kernel(db), buildJobs, agentAccess: new AgentAccess(db), auth: createAuth(db) }
}

export function getRuntime() {
  if (isCloudflareWorker()) return createRuntime()
  cache.kernelRuntime ??= createRuntime().catch(error => {
    cache.kernelRuntime = undefined
    throw error
  })
  return cache.kernelRuntime
}

export async function dispatchApplicationBuild(job: { id: string; revision: number }) {
  const workflow = runtimeEnv().BUILD_WORKFLOW
  if (!workflow?.create) return
  try {
    await workflow.create({ id: `${job.id}-${job.revision}`, params: { jobId: job.id } })
  } catch (error) {
    console.error('Build workflow dispatch failed:', error instanceof Error ? error.message : 'Unknown error')
  }
}
