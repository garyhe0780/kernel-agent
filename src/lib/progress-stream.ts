import { workspaceHeaders } from './workspace-selection'
export type BuildProgress = { stage: 'planning' | 'generating' | 'validating' | 'repairing' | 'saving'; message: string }
export type ProgressEvent = { type: 'progress'; progress: BuildProgress } | { type: 'heartbeat' } | { type: 'result'; result: unknown } | { type: 'error'; error: string }

/** POST SSE: no automatic retries, which could duplicate generation. */
export async function consumeProgress<T>(response: Response, onProgress: (progress: BuildProgress) => void): Promise<T> {
  if (!response.ok) {
    const body = await response.json()
    throw new Error(body.error || 'Unable to start the build.')
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Progress connection unavailable. Reopen your saved plan to check its status.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const event = JSON.parse(data) as ProgressEvent
        if (event.type === 'progress') onProgress(event.progress)
        if (event.type === 'error') throw new Error(event.error)
        if (event.type === 'result') return event.result as T
      }
      if (done) throw new Error('Progress connection ended before completion. Your plan is saved; check build status before retrying.')
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function progressRequest<T>(body: unknown, onProgress: (progress: BuildProgress) => void): Promise<T> {
  try {
    return await consumeProgress<T>(await fetch('/api/kernel', { method: 'POST', credentials: 'same-origin', headers: { ...workspaceHeaders(), 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) }), onProgress)
  } catch (e) {
    if (e instanceof TypeError) throw new Error('Progress connection lost. Your plan is saved; check build status before retrying.')
    throw e
  }
}
