import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consumeProgress } from '../src/lib/progress-stream'
import { progressResponse } from '../src/lib/progress-stream.server'

test('SSE flushes before work completes and delivers ordered real stages plus result', async () => {
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const response = progressResponse(async report => {
    report({ stage: 'generating', message: 'Generating' })
    await waiting
    report({ stage: 'validating', message: 'Validating' })
    return { id: 'saved-draft' }
  }, () => 'Safe error')
  assert.match(response.headers.get('content-type')!, /text\/event-stream/)
  const reader = response.body!.getReader()
  const first = await reader.read()
  assert.match(new TextDecoder().decode(first.value), /heartbeat/)
  reader.releaseLock()
  const seen: string[] = []
  const result = consumeProgress<{ id: string }>(response, event => seen.push(event.stage))
  release()
  assert.deepEqual(await result, { id: 'saved-draft' })
  assert.deepEqual(seen, ['generating', 'validating'])
})

test('client handles frames and unicode split across arbitrary bytes', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"heartbeat"}\n\ndata: {"type":"progress","progress":{"stage":"saving","message":"保存"}}\n\ndata: {"type":"result","result":{"ok":true}}\n\n')
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
  const seen: string[] = []
  assert.deepEqual(await consumeProgress(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), p => seen.push(p.message)), { ok: true })
  assert.deepEqual(seen, ['保存'])
})

test('SSE errors are sanitized and truncated streams require checking saved state', async () => {
  const failed = progressResponse(async () => { throw new Error('secret provider body') }, () => 'Please retry from your saved plan.')
  await assert.rejects(consumeProgress(failed, () => {}), /Please retry from your saved plan/)
  await assert.rejects(consumeProgress(new Response('data: {"type":"heartbeat"}\n\n', { headers: { 'content-type': 'text/event-stream' } }), () => {}), /check build status/)
})

test('disconnect stops delivery but lets the claimed operation finish once', async () => {
  let release!: () => void
  let finished = 0
  const waiting = new Promise<void>(resolve => { release = resolve })
  let completed!: () => void
  const completion = new Promise<void>(resolve => { completed = resolve })
  const response = progressResponse(async report => { await waiting; report({ stage: 'saving', message: 'Saving' }); finished++; completed(); return {} }, () => 'Safe')
  await response.body!.cancel()
  release()
  await completion
  assert.equal(finished, 1)
})
