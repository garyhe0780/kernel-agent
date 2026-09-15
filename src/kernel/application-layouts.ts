import { z } from 'zod'
import type { Definition, RecordData } from './definition'

export const sectionConditionSchema = z.object({
  field: z.string().min(1).max(50),
  operator: z.enum(['eq', 'neq', 'lte', 'gte']),
  value: z.union([z.string().max(500), z.number().finite(), z.boolean()]),
}).strict()
export type SectionCondition = z.infer<typeof sectionConditionSchema>

export function sectionMatches(data: RecordData, condition?: SectionCondition | null) {
  if (!condition) return true
  const value = data[condition.field]
  if (value === undefined || value === null) return false
  if (condition.operator === 'eq') return value === condition.value
  if (condition.operator === 'neq') return typeof value === typeof condition.value && value !== condition.value
  return typeof value === 'number' && typeof condition.value === 'number' && (condition.operator === 'lte' ? value <= condition.value : value >= condition.value)
}

export const recordLayoutSchema = z.object({
  entity: z.string().min(1).max(40),
  sections: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    name: z.string().trim().min(2).max(60),
    when: sectionConditionSchema.nullable().optional(),
    fields: z.array(z.string().min(1).max(50)).max(30),
  }).strict()).min(1).max(8),
}).strict()
export type RecordLayout = z.infer<typeof recordLayoutSchema>

/** Unassigned and newly added fields remain visible; layouts are not permissions. */
export function recordSections(definition: Definition, layout?: RecordLayout, data?: RecordData) {
  if (!layout) return [{ id: 'default', name: '', fields: Object.keys(definition.entity.fields) }]
  const used = new Set(layout.sections.flatMap(section => section.fields))
  const remaining = Object.keys(definition.entity.fields).filter(key => !used.has(key))
  return [...layout.sections.filter(section => section.fields.length && (data === undefined || sectionMatches(data, section.when))), ...(remaining.length ? [{ id: '$remaining', name: 'Other details', fields: remaining }] : [])]
}
