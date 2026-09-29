import { z } from 'zod'
import { validateFields, type Definition } from './definition'

/** Snapshots load the newest records of each entity in pages, up to a ceiling per entity. */
export const snapshotRecordLimits = { page: 500, max: 5000 } as const
export type RecordPageInfo = { loaded: number; total: number }

// '$' cannot occur in declarative action identifiers, so creation cannot shadow a domain action.
export const CREATE_ACTION = '$create'
export const createProposalSchema = z.object({
  capability: z.string().min(1).max(200),
  input: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(8).max(100),
}).strict()
export const agentExecutionSchema = z.discriminatedUnion('operation', [
  createProposalSchema.extend({ operation: z.literal('create') }),
  createProposalSchema.extend({ operation: z.literal('action'), recordId: z.string().min(1), action: z.string().min(1) }),
])
export const recordQuerySchema = z.object({
  capability: z.string().min(1).max(200),
  filters: z.array(z.object({ field: z.string().min(1).max(50), value: z.union([z.string().max(500), z.number().int(), z.boolean()]) }).strict()).max(6).default([]),
  viewId: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict()

export function creationValues(definition: Definition, raw: unknown) {
  const after = validateFields(definition.entity.fields, raw, true)
  const input = Object.fromEntries(Object.entries(after).filter(([key]) => definition.entity.fields[key].editable))
  return { input, after }
}

export function creationContract(definition: Definition) {
  const fields = Object.entries(definition.entity.fields).filter(([, field]) => field.editable)
  return {
    type: 'object' as const, additionalProperties: false,
    required: fields.filter(([, field]) => field.required && field.default === undefined).map(([key]) => key),
    properties: Object.fromEntries(fields.map(([key, field]) => [key, {
      type: field.type === 'enum' ? 'string' : field.type,
      description: field.reference ? `${field.label}: record ID from ${field.reference}` : field.label,
      ...(field.format === 'date' ? { anyOf: [{ type: 'string', format: field.format }, { const: '' }] } : {}),
      ...(field.options ? { enum: field.options } : {}),
      ...(field.default !== undefined ? { default: field.default } : {}),
      ...(field.min !== undefined ? { [field.type === 'integer' ? 'minimum' : 'minLength']: field.min } : {}),
      ...(field.max !== undefined ? { [field.type === 'integer' ? 'maximum' : 'maxLength']: field.max } : {}),
    }])),
  }
}
