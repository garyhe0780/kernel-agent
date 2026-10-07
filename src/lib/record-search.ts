import type { Definition, RecordData } from '@/kernel/definition'

/** Include displayed names while retaining searches by stored values and IDs. */
export function recordSearchText(data: RecordData, definition: Definition, relatedTitles: ReadonlyMap<string, string>, memberNames: ReadonlyMap<string, string>) {
  const values = Object.values(data).map(String)
  for (const [key, field] of Object.entries(definition.entity.fields)) {
    const value = data[key]
    if (typeof value !== 'string' || !value) continue
    const label = field.reference ? relatedTitles.get(value) : field.format === 'user' ? memberNames.get(value) : undefined
    if (label) values.push(label)
  }
  return values.join(' ').toLowerCase()
}
