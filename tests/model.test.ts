import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { modelJson, modelStatus } from '../src/kernel/model.server'

const providerEnv = ['KERNEL_MODEL_TIMEOUT_MS', 'KERNEL_API_BASE_URL', 'KERNEL_API_KEY', 'KERNEL_REASONING_EFFORT'] as const
let savedProviderEnv: Record<string, string | undefined>
beforeEach(() => {
  savedProviderEnv = Object.fromEntries(providerEnv.map(key => [key, process.env[key]]))
  for (const key of providerEnv) delete process.env[key]
})
afterEach(() => {
  for (const key of providerEnv) {
    if (savedProviderEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedProviderEnv[key]
  }
})

test('model adapter preserves server credentials, ignores reasoning, and rejects incomplete/refused/invalid output', async () => {
  const oldKey = process.env.OPENAI_API_KEY
  const oldModel = process.env.KERNEL_MODEL
  process.env.OPENAI_API_KEY = 'test-only-key'
  process.env.KERNEL_MODEL = 'test-model'
  try {
    const result = await modelJson('Return JSON', { brief: 'A test application' }, async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only-key')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.store, false)
      assert.equal(body.model, 'test-model')
      return Response.json({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] })
    })
    assert.deepEqual(result, { ok: true })
    for (const body of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'invalid' }] }] }]) {
      await assert.rejects(modelJson('JSON', {}, async () => Response.json(body)))
    }
    await assert.rejects(modelJson('JSON', {}, async () => new Response('private provider error', { status: 401 })), /model request failed \(401\)/)
    delete process.env.OPENAI_API_KEY
    await assert.rejects(modelJson('JSON', {}, async () => { throw new Error('must not call') }), /not connected/)
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('builder requests a catalog assembly and repairs invalid generated links', async () => {
  const { buildApplication } = await import('../src/kernel/model.server')
  const { purchasingAssembly, compileAssembly } = await import('../src/kernel/application')
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.KERNEL_MODEL
  process.env.OPENAI_API_KEY = 'test-only-key'; process.env.KERNEL_MODEL = 'test-model'
  let calls = 0
  try {
    const assembly = purchasingAssembly()
    const result = await buildApplication('Create purchasing with an awaiting decision view', undefined, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.match(body.instructions, /catalog/)
      assert.match(body.instructions, /purchasing.request/)
      assert.match(body.instructions, /sales.opportunity/)
      assert.match(body.instructions, /never an entities document/)
      calls++
      if (calls === 2) assert.match(JSON.parse(body.input).validationError, /must be linked/)
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(calls === 1 ? { ...assembly, links: [] } : assembly) }] }] })
    })
    assert.equal(calls, 2)
    assert.deepEqual(result, compileAssembly(assembly))
    assert.equal(result.startView, 'awaiting_decision')
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})


test('custom Responses base preserves provider prefixes and uses the provider key without exposing it', async () => {
  const oldModel = process.env.KERNEL_MODEL, oldKey = process.env.OPENAI_API_KEY
  process.env.KERNEL_MODEL = ' provider-model '
  process.env.OPENAI_API_KEY = 'legacy-key'
  process.env.KERNEL_API_KEY = 'provider-only-key'
  try {
    assert.deepEqual(modelStatus(), { configured: true, model: 'provider-model' })
    for (const base of ['https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1', 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/', 'http://127.0.0.1:8080/api/v1///']) {
      process.env.KERNEL_API_BASE_URL = base
      const output = await modelJson('Return JSON', { synthetic: true }, async (url, init) => {
        assert.equal(url, `${base.replace(/\/+$/, '')}/responses`)
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer provider-only-key')
        assert.equal(init?.redirect, 'error')
        const body = JSON.parse(String(init?.body))
        assert.equal(body.model, 'provider-model')
        assert.equal(body.store, false)
        assert.deepEqual(body.text, { format: { type: 'json_object' } })
        return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] })
      })
      assert.deepEqual(output, { ok: true })
    }
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
  }
})

test('invalid provider URLs fail before sending credentials and do not echo URL secrets', async () => {
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'provider-model'
  process.env.KERNEL_API_KEY = 'provider-only-key'
  try {
    for (const base of ['not-a-url', 'file:///tmp/private', 'https://user:secret@example.test/v1', 'https://example.test/v1?key=secret', 'https://example.test/v1#secret']) {
      process.env.KERNEL_API_BASE_URL = base
      await assert.rejects(modelJson('JSON', {}, async () => { assert.fail('Must not send a request') }), (error: any) => {
        assert.equal(error.code, 'MODEL_CONFIG_INVALID')
        assert.equal(error.message.includes('secret'), false)
        return true
      })
    }
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('operational planner shares validated Responses transport and preserves the review-only contract', async () => {
  const { planOperation } = await import('../src/kernel/model.server')
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  try {
    const context = { instruction: 'Open synthetic lead', records: [{ id: 'qa-lead' }], capabilities: [], pending: [] }
    const plan = { explanation: 'Propose opening the lead.', recordId: 'qa-lead', action: 'open', input: {} }
    assert.deepEqual(await planOperation(context, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.match(body.instructions, /only stage a proposal for human review, not apply/)
      assert.deepEqual(JSON.parse(body.input), context)
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan) }] }] })
    }), plan)
    await assert.rejects(planOperation(context, async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...plan, apply: true }) }] }] })))
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('application planner receives catalog modules and keeps unsupported work in limitations', async () => {
  const { planApplication } = await import('../src/kernel/model.server')
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  try {
    const proposal = { plan: { name: 'Team sales', summary: 'Track opportunities', records: 'Opportunities and customers', workflow: 'Open then convert', rules: 'Owners review conversion', limitations: 'No invented modules.' }, questions: [] }
    assert.deepEqual(await planApplication({ request: 'Track customers and opportunities.', messages: [], answers: {}, proposal: null }, undefined, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      const input = JSON.parse(body.input)
      assert.ok(input.catalog.some((item: { id: string }) => item.id === 'sales.opportunity'))
      assert.match(body.instructions, /Do not invent modules/)
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }] })
    }), proposal)
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})


test('clarification repairs schema echoes once and rejects persistently invalid output', async () => {
  const { clarifyApplication } = await import('../src/kernel/model.server')
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  const response = (data: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] })
  try {
    let calls = 0
    const plan = { summary: 'Clarify purchasing requirements.', questions: [] }
    const result = await clarifyApplication('Rename Purchasing to Procurement', undefined, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.match(body.instructions, /not a JSON Schema/)
      calls++
      if (calls === 1) return response({ type: 'object', properties: {} })
      assert.equal(JSON.parse(body.input).invalidResponse.type, 'object')
      assert.ok(JSON.parse(body.input).catalog.some((item: { id: string }) => item.id === 'sales.opportunity'))
      assert.equal(typeof JSON.parse(body.input).validationError, 'string')
      return response(plan)
    })
    assert.deepEqual(result, plan)
    assert.equal(calls, 2)
    calls = 0
    await assert.rejects(clarifyApplication('Clarify purchasing', undefined, async () => { calls++; return response({ type: 'object' }) }), /could not produce clear questions/)
    assert.equal(calls, 2)
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('optional reasoning effort is forwarded and invalid effort fails before transport', async () => {
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  try {
    process.env.KERNEL_REASONING_EFFORT = 'medium'
    await modelJson('Return JSON', {}, async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)).reasoning, { effort: 'medium' })
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] })
    })
    process.env.KERNEL_REASONING_EFFORT = 'invalid'
    await assert.rejects(modelJson('Return JSON', {}, async () => { assert.fail('No request with invalid configuration') }), (error: any) => error.code === 'MODEL_CONFIG_INVALID')
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})


test('provider JSON may use one complete Markdown fence but surrounding prose stays invalid', async () => {
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  const reply = (text: string) => async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] })
  try {
    for (const text of ['```json\n{"ok":true}\n```', '  ```\n{"ok":true}\n```  ']) assert.deepEqual(await modelJson('Return JSON', {}, reply(text)), { ok: true })
    for (const text of ['Here is JSON: {"ok":true}', '```json\n{"ok":true}\n```\nExtra text', '```json\n{broken}\n```']) await assert.rejects(modelJson('Return JSON', {}, reply(text)), /invalid response/)
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('model deadline covers response body and distinguishes timeout from connection errors', async () => {
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'test-only-key'
  process.env.KERNEL_MODEL_TIMEOUT_MS = '1000'
  try {
    await assert.rejects(modelJson('JSON', {}, async (_url, init) => new Response(new ReadableStream({
      start(controller) { init!.signal!.addEventListener('abort', () => controller.error(new Error('private transport details')), { once: true }) },
    }))), (error: any) => error.code === 'MODEL_TIMEOUT' && error.status === 504 && /1-second/.test(error.message))
    await assert.rejects(modelJson('JSON', {}, async () => { throw new Error('secret connection details') }), (error: any) => error.code === 'MODEL_UNAVAILABLE' && !error.message.includes('secret'))
    await assert.rejects(modelJson('JSON', {}, async () => new Response('{invalid')), (error: any) => error.code === 'INVALID_MODEL_OUTPUT')
    for (const value of ['0', '-1', '1000.5', '900001', 'NaN']) {
      process.env.KERNEL_MODEL_TIMEOUT_MS = value
      await assert.rejects(modelJson('JSON', {}, async () => { assert.fail('Invalid timeout must not send credentials') }), (error: any) => error.code === 'MODEL_CONFIG_INVALID')
    }
  } finally {
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})

test('connection probe sends no workspace data and reports only safe status', async () => {
  const { testModelConnection, modelSettings } = await import('../src/kernel/model.server')
  const oldModel = process.env.KERNEL_MODEL
  process.env.KERNEL_MODEL = 'test-model'; process.env.KERNEL_API_KEY = 'private-key'
  process.env.KERNEL_API_BASE_URL = 'https://gateway.example.test/api'
  try {
    assert.equal(modelSettings().hostname, 'gateway.example.test')
    assert.ok(!JSON.stringify(modelSettings()).includes('private-key'))
    const result = await testModelConnection(async (url, init) => {
      assert.equal(url, 'https://gateway.example.test/api/responses')
      const body = JSON.parse(String(init?.body))
      assert.deepEqual(body, {model:'test-model',input:'Reply with OK.',store:false,max_output_tokens:64})
      return Response.json({status:'completed',output:[{content:[{text:'OK'}]}]})
    })
    assert.ok(result.latencyMs >= 0)
    await assert.rejects(testModelConnection(async () => new Response('private provider body', {status:401})), /HTTP 401/)
    await assert.rejects(testModelConnection(async () => Response.json({status:'incomplete'})), /did not complete/)
    await assert.rejects(testModelConnection(async () => {throw new Error('private upstream error')}), /could not complete/)
  } finally { if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel }
})
