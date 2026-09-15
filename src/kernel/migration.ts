import { applicationPresentation } from './application-views'
import { validateApplication, type Application } from './application'
import { validateFields, type Definition, type Field, type RecordData } from './definition'

export type MigrationChange = { entity: string; label: string; before: string; after: string }
export type MigrationReport = {
  changes: MigrationChange[]
  blockers: { entity: string; message: string; recordId?: string }[]
  blockerCount: number
  recordCount: number
  updatedRecordCount: number
  invalidatedProposals: number
  entities: { slug: string; name: string; records: number; updatedRecords: number; added: boolean }[]
  examples: { entity: string; title: string; fields: { label: string; before: string; after: string }[] }[]
  canPublish: boolean
}
export type MigrationPreview = { token: string; draftVersion: number; projectVersion: number; report: MigrationReport }
export type MigratingRecord = { id: string; capability: string; entity: string; version: number; data: RecordData }

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function namespaceApplication(app: Application, slug: string): Definition[] {
  const fields = (map: Record<string, Field>) => Object.fromEntries(Object.entries(map).map(([key, field]) => [key, { ...field, ...(field.reference ? { reference: `${slug}__${field.reference}` } : {}) }]))
  return app.entities.map(entity => ({ ...entity, slug: `${slug}__${entity.slug}`, entity: { ...entity.entity, fields: fields(entity.entity.fields) }, actions: entity.actions.map(action => ({ ...action, input: fields(action.input) })) }))
}

function fieldSummary(field: Field) {
  return [field.label, field.reference ? `Links to ${field.reference}` : field.type, field.required ? 'required' : 'optional', field.editable ? 'editable' : 'set by actions', field.default === undefined ? '' : `default: ${String(field.default)}`, field.options?.join(', '), field.min === undefined ? '' : `minimum: ${field.min}`, field.max === undefined ? '' : `maximum: ${field.max}`].filter(Boolean).join(' · ')
}
function actionSummary(action: Definition['actions'][number], entity: Definition) {
  return [action.label, action.description, `Roles: ${action.roles.join(', ')}`,
    ...Object.values(action.input).map(f => `Input: ${fieldSummary(f)}`),
    ...[...action.preconditions, ...action.policies].map(r => `${r.label}: ${entity.entity.fields[r.field]?.label ?? r.field} ${r.operator === 'lte' ? '≤' : '='} ${String(r.setting ? entity.settings[r.setting] : r.value)}${r.enabledBy ? ` (enabled: ${String(entity.settings[r.enabledBy])})` : ''}`),
    ...Object.entries(action.effects).map(([key, value]) => `Set ${entity.entity.fields[key]?.label ?? key}: ${String(value)}`),
  ].join('; ')
}

export function planMigration(beforeRaw: unknown, afterRaw: unknown, projectSlug: string, records: MigratingRecord[], pending: { capability: string }[]) {
  const before = validateApplication(beforeRaw)
  const after = validateApplication(afterRaw)
  const changes: MigrationChange[] = []
  const blockers: MigrationReport['blockers'] = []
  let blockerCount = 0
  const block = (entity: string, message: string, recordId?: string) => { blockerCount++; if (blockers.length < 20) blockers.push({ entity, message, ...(recordId ? { recordId } : {}) }) }
  const change = (entity: string, label: string, a: string, b: string) => { if (a !== b) changes.push({ entity, label, before: a, after: b }) }
  const describeView = (app: Application, id: string) => {
    const view = app.views.find(view => view.id === id)
    if (!view) return 'Not present'
    const entity = app.entities.find(entity => entity.slug === view.entity)!
    const filters = view.filters.map(filter => `${entity.entity.fields[filter.field].label} ${filter.operator === 'eq' ? 'equals' : filter.operator === 'lte' ? 'at most' : 'at least'} ${filter.field.endsWith('Cents') && typeof filter.value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(filter.value / 100) : String(filter.value)}`).join(' and ') || 'All records'
    return `${view.name} · ${entity.entity.label} · ${filters} · Sort: ${view.sort.field === '$createdAt' ? 'Created time' : entity.entity.fields[view.sort.field].label} ${view.sort.direction === 'asc' ? 'ascending' : 'descending'} · Columns: ${view.columns.length ? view.columns.map(key => entity.entity.fields[key].label).join(', ') : 'Default'}`
  }
  for (const id of new Set([...before.views.map(view => view.id), ...after.views.map(view => view.id)])) change('Application', `View: ${after.views.find(view => view.id === id)?.name ?? before.views.find(view => view.id === id)?.name}`, describeView(before, id), describeView(after, id))
  const describeNavigation = (app: Application) => applicationPresentation(app).navigation.map(item => `${item.label} (${app.entities.find(entity => entity.slug === item.entity)?.entity.label})`).join(' → ')
  change('Application', 'Navigation', describeNavigation(before), describeNavigation(after))
  change('Application', 'Starting view', before.views.find(view => view.id === before.startView)?.name ?? 'All records', after.views.find(view => view.id === after.startView)?.name ?? 'All records')
  const describeLayout = (app: Application, slug: string) => {
    const layout = app.layouts.find(layout => layout.entity === slug)
    const entity = app.entities.find(entity => entity.slug === slug)
    return layout ? layout.sections.map(section => `${section.name}${section.when ? ` (when ${entity?.entity.fields[section.when.field]?.label ?? section.when.field} ${{ eq: 'equals', neq: 'does not equal', lte: 'is at most', gte: 'is at least' }[section.when.operator]} ${section.when.field.endsWith('Cents') && typeof section.when.value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(section.when.value / 100) : String(section.when.value)})` : ''}: ${section.fields.map(key => entity?.entity.fields[key]?.label ?? key).join(', ') || 'No fields'}`).join(' → ') : 'Default field order'
  }
  for (const slug of new Set([...before.layouts.map(layout => layout.entity), ...after.layouts.map(layout => layout.entity)])) change('Application', `Record layout: ${after.entities.find(entity => entity.slug === slug)?.entity.label ?? slug}`, describeLayout(before, slug), describeLayout(after, slug))
  change('Application', 'Name', before.name, after.name)
  change('Application', 'Description', before.description, after.description)
  change('Application', 'Assumptions', before.assumptions.join('; '), after.assumptions.join('; '))
  for (const entity of before.entities) {
    const next = after.entities.find(e => e.slug === entity.slug)
    if (!next) { block(entity.name, 'Removing or renaming an entity is not supported. Keep its identifier to preserve existing records.'); continue }
    if (next.entity.name !== entity.entity.name) block(entity.name, 'Changing the stored entity identifier is not supported.')
    for (const [key, field] of Object.entries(entity.entity.fields)) {
      const nextField = next.entity.fields[key]
      if (!nextField) block(entity.name, `Removing or renaming ${field.label} is not supported. Keep its field identifier.`)
      else if (field.type !== nextField.type || field.reference !== nextField.reference) block(entity.name, `Changing the type or relationship target of ${field.label} is not supported.`)
    }
  }
  const updates: { id: string; version: number; data: RecordData }[] = []
  const changedCapabilities: string[] = []
  const reportEntities: MigrationReport['entities'] = []
  const examples: MigrationReport['examples'] = []
  for (const entity of after.entities) {
    const old = before.entities.find(e => e.slug === entity.slug)
    const capability = `${projectSlug}__${entity.slug}`
    if (!old || canonical(old) !== canonical(entity)) changedCapabilities.push(capability)
    if (!old) change(entity.name, 'Entity', 'Not present', `${entity.name} · ${entity.entity.label}`)
    else {
      change(entity.name, 'Name', old.name, entity.name)
      change(entity.name, 'Record label', old.entity.label, entity.entity.label)
      change(entity.name, 'Description', old.description, entity.description)
      change(entity.name, 'Review roles', old.reviewerRoles.join(', '), entity.reviewerRoles.join(', '))
    }
    for (const [key, field] of Object.entries(entity.entity.fields)) change(entity.name, field.label, old?.entity.fields[key] ? fieldSummary(old.entity.fields[key]) : 'Not present', fieldSummary(field))
    for (const key of new Set([...Object.keys(old?.settings ?? {}), ...Object.keys(entity.settings)])) change(entity.name, key === 'approvalLimitCents' ? 'Approval ceiling (USD cents)' : key, String(old?.settings[key] ?? 'Not present'), String(entity.settings[key] ?? 'Removed'))
    for (const name of new Set([...(old?.actions.map(a => a.name) ?? []), ...entity.actions.map(a => a.name)])) {
      const a = old?.actions.find(a => a.name === name), b = entity.actions.find(a => a.name === name)
      change(entity.name, `Action: ${b?.label ?? a?.label}`, a && old ? actionSummary(a, old) : 'Not present', b ? actionSummary(b, entity) : 'Removed')
    }
    const ownedRecords = records.filter(r => r.capability === capability)
    const countBefore = updates.length
    for (const record of ownedRecords) {
      try {
        // Add defaults only to absent fields. Existing values are never overwritten by a new default.
        const candidate = { ...record.data }
        for (const [key, field] of Object.entries(entity.entity.fields)) if (candidate[key] === undefined && field.default !== undefined) candidate[key] = field.default
        validateFields(entity.entity.fields, candidate)
        for (const [key, field] of Object.entries(entity.entity.fields)) {
          if (!field.reference) continue
          if (!candidate[key] && field.required) throw new Error(`${field.label} needs an existing linked record.`)
          if (candidate[key] && !records.some(r => r.id === candidate[key] && r.capability === `${projectSlug}__${field.reference}`)) throw new Error(`${field.label} points to an unavailable record.`)
        }
        if (canonical(candidate) !== canonical(record.data)) {
          updates.push({ id: record.id, version: record.version, data: candidate })
          if (examples.length < 5) examples.push({ entity: entity.name, title: String(record.data.title), fields: Object.entries(candidate).filter(([key, value]) => value !== record.data[key]).map(([key, value]) => ({ label: entity.entity.fields[key].label, before: record.data[key] === undefined ? 'Not set' : String(record.data[key]), after: String(value) })) })
        }
      } catch (error) { block(entity.name, error instanceof Error ? error.message : 'Record is incompatible with this definition.', record.id) }
    }
    reportEntities.push({ slug: entity.slug, name: entity.name, records: ownedRecords.length, updatedRecords: updates.length - countBefore, added: !old })
  }
  const report: MigrationReport = { changes, blockers, blockerCount, recordCount: records.length, updatedRecordCount: updates.length, invalidatedProposals: pending.filter(p => changedCapabilities.includes(p.capability)).length, entities: reportEntities, examples, canPublish: blockerCount === 0 }
  return { report, updates, changedCapabilities }
}
