import type { BuildJobSnapshot } from '../kernel/build-job'

/** A read-only subscription. Cancellation only stops polling, never the worker. */
export function buildJobResponse(read: () => Promise<BuildJobSnapshot>, initial: BuildJobSnapshot, after = 0) {
  let closed = false, timer: ReturnType<typeof setTimeout> | undefined
  let revision = after
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (job: BuildJobSnapshot) => {
        if (closed) return
        if (job.revision !== revision) {
          controller.enqueue(encoder.encode(`id: ${job.revision}\ndata: ${JSON.stringify(job)}\n\n`))
          revision = job.revision
        } else controller.enqueue(encoder.encode(': heartbeat\n\n'))
        if (!['queued', 'running'].includes(job.status)) { closed = true; controller.close() }
      }
      const poll = async () => {
        try { const job = await read(); if (!closed) send(job) }
        catch { if (!closed) { closed = true; controller.close() } }
        if (!closed) timer = setTimeout(poll, 1000)
      }
      send(initial)
      if (!closed) timer = setTimeout(poll, 1000)
    },
    cancel() { closed = true; clearTimeout(timer) },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
