import type { Kernel } from './engine.server'

/** A long-lived process resumes all persisted queued and review-waiting runs. */
export function startAgentRunWorker(kernel: Kernel) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    try { await kernel.pollAgentRuns() } catch (error) { console.error('Agent run worker failed:', error instanceof Error ? error.name : 'Unknown error') }
    if (!stopped) { timer = setTimeout(tick, 1000); timer.unref?.() }
  }
  void tick()
  return () => { stopped = true; clearTimeout(timer) }
}
