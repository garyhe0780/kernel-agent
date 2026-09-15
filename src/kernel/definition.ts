import { z } from 'zod'

export const fieldSchema = z.object({
  label: z.string(),
  type: z.enum(['string', 'integer', 'boolean', 'enum']),
  required: z.boolean().default(true),
  editable: z.boolean().default(true),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  reference: z.string().optional(),
}).strict()

const predicateSchema = z.object({
  id: z.string(), label: z.string(), field: z.string(),
  operator: z.enum(['eq', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  setting: z.string().optional(),
  enabledBy: z.string().optional(),
}).strict()

export const definitionSchema = z.object({
  slug: z.string(), name: z.string(), description: z.string(),
  entity: z.object({ name: z.string(), label: z.string(), fields: z.record(z.string(), fieldSchema) }).strict(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  reviewerRoles: z.array(z.string()).min(1),
  actions: z.array(z.object({
    name: z.string(), label: z.string(), description: z.string(),
    roles: z.array(z.string()).min(1),
    input: z.record(z.string(), fieldSchema),
    preconditions: z.array(predicateSchema),
    policies: z.array(predicateSchema),
    effects: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }).strict()).min(1),
}).strict()

export type Definition = z.infer<typeof definitionSchema>
export type Field = z.infer<typeof fieldSchema>
export type RecordData = Record<string, string | number | boolean>
export type Check = { id: string; label: string; passed: boolean; message: string }
export type Principal = { userId: string; name: string; workspaceId: string; role: string; kind: 'human' | 'agent'; agentCredentialId?: string }

export const procurement = definitionSchema.parse({
  slug: 'procurement', name: 'Procurement',
  description: 'From purchase request to an approved decision, with a reviewable record of every change.',
  entity: {
    name: 'purchase_request', label: 'Purchase request',
    fields: {
      title: { label: 'Request', type: 'string', min: 3, max: 100 },
      supplier: { label: 'Supplier', type: 'string', min: 2, max: 80 },
      amountCents: { label: 'Amount (USD cents)', type: 'integer', min: 1, max: 100000000 },
      category: { label: 'Category', type: 'enum', options: ['Software', 'Equipment', 'Services', 'Office'] },
      justification: { label: 'Business reason', type: 'string', min: 5, max: 1000 },
      supplierVerified: { label: 'Supplier verified', type: 'boolean', default: false },
      status: { label: 'Status', type: 'enum', options: ['draft', 'submitted', 'approved', 'declined'], default: 'draft', editable: false },
      decisionNote: { label: 'Decision note', type: 'string', required: false, max: 500, default: '', editable: false },
    },
  },
  settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true },
  reviewerRoles: ['owner'],
  actions: [
    {
      name: 'submit', label: 'Submit request', description: 'Propose moving a draft purchase request into review.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Request is a draft', field: 'status', operator: 'eq', value: 'draft' }],
      policies: [], effects: { status: 'submitted' },
    },
    {
      name: 'approve', label: 'Approve purchase', description: 'Propose approval after checking the spending limit and supplier verification. A human must apply the proposal.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Request is submitted', field: 'status', operator: 'eq', value: 'submitted' }],
      policies: [
        { id: 'spend', label: 'Within approval limit', field: 'amountCents', operator: 'lte', setting: 'approvalLimitCents' },
        { id: 'supplier', label: 'Supplier is verified', field: 'supplierVerified', operator: 'eq', value: true, enabledBy: 'requireVerifiedSupplier' },
      ], effects: { status: 'approved' },
    },
    {
      name: 'decline', label: 'Decline purchase', description: 'Propose declining a submitted request, with a required decision reason.',
      roles: ['owner', 'operator'],
      input: { reason: { label: 'Decision reason', type: 'string', min: 5, max: 500 } },
      preconditions: [{ id: 'state', label: 'Request is submitted', field: 'status', operator: 'eq', value: 'submitted' }],
      policies: [], effects: { status: 'declined', decisionNote: '$input.reason' },
    },
  ],
})

export function validateFields(fields: Record<string, Field>, raw: unknown, create = false): RecordData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected an object.')
  const input = raw as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!fields[key]) throw new Error(`Unknown field: ${key}`)
    if (create && !fields[key].editable) throw new Error(`${fields[key].label} is set by the kernel.`)
  }
  const result: RecordData = {}
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key] ?? field.default
    if (value === undefined) {
      if (field.required) throw new Error(`${field.label} is required.`)
      continue
    }
    if (field.type === 'integer') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${field.label} must be a whole number.`)
      if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) throw new Error(`${field.label} is outside the allowed range.`)
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${field.label} must be true or false.`)
    } else {
      if (typeof value !== 'string') throw new Error(`${field.label} must be text.`)
      if (field.type === 'enum' && !field.options?.includes(value)) throw new Error(`${field.label} is not a supported choice.`)
      if (field.min !== undefined && value.trim().length < field.min || field.max !== undefined && value.length > field.max) throw new Error(`${field.label} must be ${field.min ?? 0}–${field.max ?? 'unlimited'} characters.`)
    }
    result[key] = typeof value === 'string' ? value.trim() : value as number | boolean
  }
  return result
}

export function evaluate(definition: Definition, actionName: string, record: RecordData, rawInput: unknown, role: string) {
  const action = definition.actions.find(a => a.name === actionName)
  if (!action) throw new Error('Unknown action.')
  const input = validateFields(action.input, rawInput)
  const checks: Check[] = [{ id: 'permission', label: 'Actor may propose this action', passed: action.roles.includes(role), message: action.roles.includes(role) ? 'Role is authorized' : 'Your role cannot propose this action' }]
  for (const rule of [...action.preconditions, ...action.policies]) {
    const disabled = rule.enabledBy && definition.settings[rule.enabledBy] === false
    const expected = rule.setting ? definition.settings[rule.setting] : rule.value
    const actual = record[rule.field]
    const passed = !!disabled || (rule.operator === 'eq' ? actual === expected : typeof actual === 'number' && typeof expected === 'number' && actual <= expected)
    checks.push({ id: rule.id, label: rule.label, passed, message: disabled ? 'Optional policy is disabled' : passed ? 'Passed' : `Expected ${rule.field} ${rule.operator === 'lte' ? '≤' : '='} ${expected}; received ${actual}` })
  }
  const after = { ...record }
  for (const [key, value] of Object.entries(action.effects)) {
    after[key] = typeof value === 'string' && value.startsWith('$input.') ? input[value.slice(7)] : value
  }
  validateFields(definition.entity.fields, after)
  return { action, input, checks, after, allowed: checks.every(c => c.passed) }
}

export function toolContracts(definition: Definition) {
  return definition.actions.map(action => ({
    name: `${definition.slug}.${action.name}`, description: action.description,
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['recordId', 'idempotencyKey', ...Object.entries(action.input).filter(([, f]) => f.required).map(([key]) => key)],
      properties: {
        recordId: { type: 'string', description: 'ID returned by list_records' },
        idempotencyKey: { type: 'string', minLength: 8, maxLength: 100, description: 'A unique key for this proposal; reuse only when retrying the identical call' },
        ...Object.fromEntries(Object.entries(action.input).map(([key, f]) => [key, { type: f.type === 'enum' ? 'string' : f.type, description: f.label, ...(f.options ? { enum: f.options } : {}), ...(f.type === 'string' && f.min !== undefined ? { minLength: f.min } : {}), ...(f.type === 'string' && f.max !== undefined ? { maxLength: f.max } : {}) }])),
      },
    },
    effect: 'Stages a proposal. Does not apply it.',
  }))
}
