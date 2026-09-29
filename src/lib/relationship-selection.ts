import type { Definition, Field, RecordData } from '../kernel/definition'

type LinkedRecord = { id: string; capability: string; data: RecordData }
type Action = Definition['actions'][number]

/** Project effect mappings, including actions whose input names differ from entity fields. */
export function actionFormData(action: Action, before: RecordData, input: RecordData): RecordData {
  const data = { ...before }
  for (const [key, effect] of Object.entries(action.effects)) {
    if (typeof effect === 'string' && effect.startsWith('$input.')) {
      const name = effect.slice(7)
      if (Object.hasOwn(input, name)) data[key] = input[name]
    } else data[key] = effect
  }
  return data
}

export function actionReferenceFields(definition: Definition, action: Action, input: string): Field[] {
  return Object.entries(action.effects).filter(([, mapping]) => mapping === `$input.${input}`).map(([key]) => definition.entity.fields[key]).filter(field => Boolean(field?.reference))
}

/** Keep an incompatible current value visible until the user explicitly clears or replaces it. */
export function relationshipSelection(field: Field, constraints: Field[], fields: Record<string, Field>, data: RecordData, records: LinkedRecord[], value: string) {
  const rules = constraints.flatMap(field => field.referenceMatch ? [field.referenceMatch] : [])
  const candidates = records.filter(record => record.capability === field.reference)
  const matching = candidates.filter(record => rules.every(rule => Boolean(data[rule.sourceField]) && record.data[rule.targetField] === data[rule.sourceField]))
  const invalid = Boolean(value && !matching.some(record => record.id === value))
  const missing = rules.find(rule => !data[rule.sourceField])
  const optional = constraints.length ? constraints.every(field => !field.required) : !field.required
  const clear = optional ? `No ${field.label.toLowerCase()}` : `Choose ${field.label.toLowerCase()}`
  const options: { value: string; label: string; disabled?: boolean }[] = [{ value: '', label: clear }, ...matching.map(record => ({ value: record.id, label: String(record.data.title) }))]
  if (invalid) options.push({ value, label: `${String(candidates.find(record => record.id === value)?.data.title ?? 'Unavailable record')} (needs attention)`, disabled: true })
  const names = [...new Set(rules.map(rule => fields[rule.sourceField]?.label.toLowerCase() ?? rule.sourceField))].join(' and ')
  const description = invalid
    ? `${field.label} is unavailable or does not match${names ? ` the selected ${names}` : ''}. ${optional ? 'Clear it or choose a matching record.' : 'Choose a matching record.'}`
    : missing ? `Choose ${fields[missing.sourceField]?.label.toLowerCase() ?? missing.sourceField} first.`
    : rules.length && !matching.length ? `No matching ${field.label.toLowerCase()} records for the selected ${names}.`
    : rules.length ? `Showing records matching the selected ${names}.` : undefined
  return { options, invalid, description }
}

export function validateRelationshipSelections(fields: Record<string, Field>, data: RecordData, records: LinkedRecord[]) {
  for (const [key, field] of Object.entries(fields)) {
    if (!field.referenceMatch || !data[key]) continue
    const result = relationshipSelection(field, [field], fields, data, records, String(data[key]))
    if (result.invalid) throw new Error(result.description)
  }
}
