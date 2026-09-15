import type { BuildJobSnapshot } from '../kernel/build-job'
import { workspaceHeaders } from './workspace-selection'

/** Resume from a persisted revision. The caller reconnects after an interrupted read. */
export async function watchBuildJob(id: string, revision: number, onSnapshot: (job: BuildJobSnapshot) => void, signal: AbortSignal) {
  const response = await fetch(`/api/kernel?buildJob=${encodeURIComponent(id)}&after=${revision}`, { credentials: 'same-origin', headers: { ...workspaceHeaders(), Accept: 'text/event-stream' }, signal })
  if (!response.ok) throw new Error(`Unable to read build status (${response.status}).`)
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Build progress connection unavailable.')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data) onSnapshot(JSON.parse(data) as BuildJobSnapshot)
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
