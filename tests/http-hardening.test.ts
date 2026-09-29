import assert from 'node:assert/strict'
import test from 'node:test'
import { trustedOrigins } from '../src/lib/env.server'
import { readBoundedText } from '../src/lib/request-body.server'
import { InputError } from '../src/kernel/errors'
import { validateFields } from '../src/kernel/definition'

test('loopback aliases are trusted only for a loopback deployment', () => {
  assert.deepEqual(trustedOrigins('https://www.fluxuslab.org'), ['https://www.fluxuslab.org'])
  assert.deepEqual(trustedOrigins('https://www.fluxuslab.org/'), ['https://www.fluxuslab.org'])
  assert.deepEqual(trustedOrigins('http://localhost:3000'), ['http://localhost:3000', 'http://127.0.0.1:3000'])
  assert.deepEqual(trustedOrigins('http://127.0.0.1:3000'), ['http://127.0.0.1:3000', 'http://localhost:3000'])
})

test('request bodies are read up to the limit and refused beyond it', async () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request('http://localhost:3000/api/kernel', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
  assert.equal(await readBoundedText(post('{"type":"example"}')), '{"type":"example"}')
  assert.equal(await readBoundedText(post('é'.repeat(10)), 20), 'é'.repeat(10))
  await assert.rejects(readBoundedText(post('x'.repeat(21)), 20), /size limit/)
  await assert.rejects(readBoundedText(post('x', { 'content-length': '999999' }), 20), /size limit/)
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 5; i++) controller.enqueue(new TextEncoder().encode('x'.repeat(10))); controller.close() } })
  await assert.rejects(readBoundedText(post(stream), 20), /size limit/)
})

test('field validation failures are input errors, distinct from server faults', () => {
  assert.throws(() => validateFields({ title: { type: 'string', label: 'Title', required: true, editable: true } }, {}), InputError)
  assert.equal(new TypeError('boom') instanceof InputError, false)
})
