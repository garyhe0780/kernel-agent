import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clarificationSchema, clarifiedBrief } from '../src/kernel/builder-clarification'
import { clarifyApplication } from '../src/kernel/model.server'

const plan = { summary: 'Create a purchasing application.', questions: [{ id: 'approval', question: 'What is the purchase approval ceiling?', reason: 'This controls which purchases can proceed.', suggestedAnswer: 'Block purchases above $10,000 pending a policy revision.' }] }

test('clarification distinguishes explicit answers from unconfirmed assumptions', () => {
  assert.throws(() => clarifiedBrief('Build purchasing', plan, {}), /Answer each/)
  assert.match(clarifiedBrief('Build purchasing', plan, { approval: '$500 ceiling' }), /Answer: \$500 ceiling/)
  assert.match(clarifiedBrief('Build purchasing', plan, {}, true), /Suggested assumption \(not confirmed\)/)
  assert.doesNotMatch(clarifiedBrief('Build purchasing', plan, { approval: '$500 ceiling' }, true), /not confirmed/)
  assert.equal(clarifiedBrief('Build purchasing', { ...plan, questions: [] }, {}), 'Build purchasing')
})

test('clarification rejects duplicate questions and oversized answers or combined briefs', () => {
  assert.equal(clarificationSchema.safeParse({ ...plan, questions: [plan.questions[0], plan.questions[0]] }).success, false)
  assert.equal(clarificationSchema.safeParse({ ...plan, questions: Array.from({ length: 4 }, (_, i) => ({ ...plan.questions[0], id: `q${i}` })) }).success, false)
  assert.throws(() => clarifiedBrief('Build purchasing', plan, { approval: 'x'.repeat(501) }), /500/)
  assert.throws(() => clarifiedBrief('x'.repeat(3990), plan, { approval: 'An answer' }), /4,000/)
})

test('model clarification asks only bounded questions and clear requests skip questions', async () => {
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.KERNEL_MODEL
  process.env.OPENAI_API_KEY = 'test-only'; process.env.KERNEL_MODEL = 'test-model'
  const output = (value: unknown) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })
  try {
    const current = { name: 'Existing purchasing' }
    const result = await clarifyApplication('Create a purchasing application', current, async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.deepEqual(JSON.parse(body.input).current, current)
      assert.match(body.instructions, /Do not ask about decisions already answered/)
      assert.match(body.instructions, /every operational action needs human review/)
      return output(plan)
    })
    assert.deepEqual(result, plan)
    assert.equal((await clarifyApplication('Rename the application to Purchasing', current, async () => output({ ...plan, questions: [] }))).questions.length, 0)
    await assert.rejects(clarifyApplication('Build purchasing', current, async () => output({ ...plan, questions: [plan.questions[0], plan.questions[0]] })), /could not produce clear questions/)
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
    if (oldModel === undefined) delete process.env.KERNEL_MODEL; else process.env.KERNEL_MODEL = oldModel
  }
})
