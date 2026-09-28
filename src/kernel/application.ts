import { z } from 'zod'
import type { ModuleCatalog } from './module-contract'
import { recordLayoutSchema } from './application-layouts'
import { assemblePattern, materializeAssembly, purchasingAssembly, salesAssembly, linearAssembly, paymentsAssembly, supportAssembly } from './compile'
import type { Assembly } from './assembly'
import { definitionSchema, validateFields, type Field, type RecordData } from './definition'
import { savedViewSchema, navigationItemSchema } from './application-views'

export { assemblePattern, purchasingAssembly, salesAssembly, linearAssembly, paymentsAssembly, supportAssembly }

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
export const applicationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(500),
  assumptions: z.array(z.string().max(500)).max(12),
  entities: z.array(definitionSchema).min(1).max(8),
  layouts: z.array(recordLayoutSchema).max(8).default([]),
  views: z.array(savedViewSchema).max(24).default([]),
  navigation: z.array(navigationItemSchema).max(8).default([]),
  startView: z.string().nullable().default(null),
}).strict()
export type Application = z.infer<typeof applicationSchema>
export type Draft = { id: string; brief: string; definition: Application; assembly?: Assembly | null; version: number; status: string; source: string; projectSlug: string | null; baseProjectVersion: number | null; updatedAt: string }

export function validateApplication(raw: unknown): Application {
  if (JSON.stringify(raw).length > 100000) throw new Error('Application definition is too large.')
  const app = applicationSchema.parse(raw)
  const slugs = new Set(app.entities.map(e => e.slug))
  if (slugs.size !== app.entities.length) throw new Error('Entity identifiers must be unique.')
  const checkKey = (key: string) => { identifier.parse(key); if (forbidden.has(key)) throw new Error(`Reserved name: ${key}`) }
  const checkField = (key: string, field: Field) => {
    // Existing fields use camelCase; allow it for fields but never prototype keys.
    if (!/^[a-z][a-zA-Z0-9_]{0,49}$/.test(key) || forbidden.has(key)) throw new Error(`Invalid field: ${key}`)
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new Error(`Invalid limits: ${field.label}`)
    if (field.type === 'enum' && (!field.options?.length || new Set(field.options).size !== field.options.length)) throw new Error(`Provide unique choices for ${field.label}.`)
    if (field.reference && (field.type !== 'string' || !slugs.has(field.reference) || field.default !== undefined)) throw new Error(`Invalid relationship: ${field.label}`)
    if (!field.reference && field.default !== undefined) validateFields({ [key]: field }, { [key]: field.default })
  }
  for (const entity of app.entities) {
    checkKey(entity.slug); checkKey(entity.entity.name)
    const fields = entity.entity.fields
    if (Object.keys(fields).length > 30 || entity.actions.length > 20) throw new Error('Use at most 30 fields and 20 actions per entity.')
    if (fields.title?.type !== 'string' || !fields.title.required || !fields.title.editable) throw new Error('Every entity needs an editable, required title field.')
    if (fields.status?.type !== 'enum' || fields.status.editable || !fields.status.default) throw new Error('Every entity needs a kernel-owned status with a default.')
    for (const [key, field] of Object.entries(fields)) {
      checkField(key, field)
      if (!field.editable && field.required && field.default === undefined) throw new Error(`${field.label} needs an initial value.`)
    }
    const roles = [...entity.reviewerRoles, ...entity.actions.flatMap(a => a.roles)]
    if (!entity.reviewerRoles.includes('owner') || roles.some(r => !['owner', 'operator'].includes(r))) throw new Error('Use supported owner/operator roles; owners must be able to review.')
    if (new Set(entity.actions.map(a => a.name)).size !== entity.actions.length) throw new Error('Action names must be unique.')
    for (const action of entity.actions) {
      checkKey(action.name)
      for (const [key, field] of Object.entries(action.input)) checkField(key, field)
      for (const rule of [...action.preconditions, ...action.policies]) {
        const field = fields[rule.field]
        if (!field) throw new Error(`Rule ${rule.label} refers to an unknown field.`)
        const value = rule.setting ? entity.settings[rule.setting] : rule.value
        if (value === undefined) throw new Error(`Rule ${rule.label} needs a comparison value.`)
        if (rule.enabledBy && typeof entity.settings[rule.enabledBy] !== 'boolean') throw new Error(`Rule ${rule.label} needs a boolean setting.`)
        if (rule.operator === 'lte' && (field.type !== 'integer' || typeof value !== 'number')) throw new Error(`Rule ${rule.label} needs numeric values.`)
        validateFields({ [rule.field]: field }, { [rule.field]: value })
      }
      for (const [key, value] of Object.entries(action.effects)) {
        const field = fields[key]
        if (!field) throw new Error(`Action ${action.label} changes an unknown field.`)
        if (typeof value === 'string' && value.startsWith('$input.')) {
          const input = action.input[value.slice(7)]
          if (!input || !input.required || input.type !== field.type || input.reference !== field.reference) throw new Error(`Invalid input mapping for ${field.label}.`)
        } else {
          if (field.reference) throw new Error('Relationships must be selected from action input.')
          validateFields({ [key]: field }, { [key]: value })
        }
      }
    }
  }
  if (new Set(app.layouts.map(layout => layout.entity)).size !== app.layouts.length) throw new Error('Use one record layout per entity.')
  for (const layout of app.layouts) {
    const entity = app.entities.find(entity => entity.slug === layout.entity)
    if (!entity) throw new Error('Record layout refers to an unknown entity.')
    if (new Set(layout.sections.map(section => section.id)).size !== layout.sections.length) throw new Error('Record section identifiers must be unique.')
    const fields = layout.sections.flatMap(section => section.fields)
    if (new Set(fields).size !== fields.length || fields.some(key => !Object.hasOwn(entity.entity.fields, key))) throw new Error('Record layouts must use known fields once only.')
    for (const section of layout.sections) {
      checkKey(section.id)
      if (!section.when) continue
      const { field: key, operator, value } = section.when
      const field = Object.hasOwn(entity.entity.fields, key) ? entity.entity.fields[key] : undefined
      if (!field || field.reference) throw new Error(`Section ${section.name} needs a field on this record, not a relationship.`)
      if ((operator === 'lte' || operator === 'gte') && (field.type !== 'integer' || typeof value !== 'number')) throw new Error(`Section ${section.name} needs a numeric field for range conditions.`)
      validateFields({ [key]: field }, { [key]: value })
    }
  }
  if (new Set(app.views.map(view => view.id)).size !== app.views.length) throw new Error('Saved view identifiers must be unique.')
  for (const view of app.views) {
    checkKey(view.id)
    if (view.id === 'all') throw new Error('The saved view identifier all is reserved.')
    const entity = app.entities.find(entity => entity.slug === view.entity)
    if (!entity) throw new Error(`View ${view.name} refers to an unknown entity.`)
    const fields = entity.entity.fields
    if (view.sort.field !== '$createdAt' && !Object.hasOwn(fields, view.sort.field)) throw new Error(`View ${view.name} sorts by an unknown field.`)
    if (fields[view.sort.field]?.reference) throw new Error('Saved views cannot sort by relationships yet.')
    if (new Set(view.columns).size !== view.columns.length || view.columns.some(key => !Object.hasOwn(fields, key))) throw new Error(`View ${view.name} has duplicate or unknown columns.`)
    if (view.columns.length && !view.columns.includes('title')) throw new Error(`View ${view.name} must include the title column.`)
    for (const filter of view.filters) {
      const field = Object.hasOwn(fields, filter.field) ? fields[filter.field] : undefined
      if (!field) throw new Error(`View ${view.name} filters an unknown field.`)
      if (filter.operator !== 'eq' && (field.type !== 'integer' || typeof filter.value !== 'number')) throw new Error(`View ${view.name} needs a numeric field and value for range filters.`)
      if (field.reference) throw new Error('Saved view relationship filters are not supported yet. Use a field on this record.')
      validateFields({ [filter.field]: field }, { [filter.field]: filter.value })
    }
  }
  if (app.navigation.length && (app.navigation.length !== app.entities.length || new Set(app.navigation.map(item => item.entity)).size !== app.entities.length || app.navigation.some(item => !slugs.has(item.entity)))) throw new Error('Navigation must include each entity exactly once.')
  if (app.startView !== null && !app.views.some(view => view.id === app.startView)) throw new Error('Choose an existing saved view as the starting view.')
  return app
}

export function compileAssembly(raw: unknown, catalog?: ModuleCatalog): Application {
  return validateApplication(materializeAssembly(raw, catalog))
}

export function purchasingExample(): Application {
  return compileAssembly(purchasingAssembly())
}

export function sampleData(fields: Record<string, Field>): RecordData {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const value = field.default ?? (field.reference ? `Example ${field.label}` : field.type === 'boolean' ? false : field.type === 'integer' ? Math.max(field.min ?? 0, Math.min(field.max ?? 100, 100)) : field.type === 'enum' ? field.options![0] : `Example ${field.label}`.padEnd(field.min ?? 0, '.').slice(0, field.max ?? 100))
    return [key, value]
  }))
}
