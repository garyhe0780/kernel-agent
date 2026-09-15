import type { BuildProgress, ProgressEvent } from './progress-stream'

/** Disconnecting stops delivery, not the already-dispatched model operation. */
export function progressResponse(work: (report: (progress: BuildProgress) => void) => Promise<unknown>, errorMessage: (error: unknown) => string) {
  let connected = true
  let timer: ReturnType<typeof setInterval> | undefined
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ProgressEvent) => {
        if (!connected) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { connected = false; clearInterval(timer) }
      }
      send({ type: 'heartbeat' })
      timer = setInterval(() => send({ type: 'heartbeat' }), 10000)
      void Promise.resolve().then(() => work(progress => send({ type: 'progress', progress })))
        .then(result => send({ type: 'result', result }))
        .catch(error => send({ type: 'error', error: errorMessage(error) }))
        .finally(() => { clearInterval(timer); if (connected) { connected = false; controller.close() } })
    },
    cancel() { connected = false; clearInterval(timer) },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
