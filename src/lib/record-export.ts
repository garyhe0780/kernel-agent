import type { Definition, RecordData } from '../kernel/definition'

type ExportRecord = { id: string; capability: string; version: number; createdAt: string; updatedAt: string; data: RecordData }
type Member = { id: string; name: string }

/** Quote every CSV cell and prevent text fields from becoming spreadsheet formulas. */
export function csvCell(value: string | number | boolean | undefined): string {
  let text = value === undefined ? '' : String(value)
  if (typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\s\uFEFF]*[=+\-@]/.test(text))) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

/** Callers supply the already filtered/sorted visible records, not an unscoped query. */
export function exportRecordsCsv(definition: Definition, visible: ExportRecord[], related: ExportRecord[], members: Member[] = []) {
  const rows = visible.filter(record => record.capability === definition.slug)
  const recordsById = new Map(related.map(record => [record.id, record]))
  const membersById = new Map(members.map(member => [member.id, member.name]))
  const columns: { header: string; value: (record: ExportRecord) => string | number | boolean | undefined }[] = [
    { header: 'Record ID', value: record => record.id },
    { header: 'Record version', value: record => record.version },
    { header: 'Created at (UTC)', value: record => record.createdAt },
    { header: 'Updated at (UTC)', value: record => record.updatedAt },
  ]
  for (const [key, field] of Object.entries(definition.entity.fields)) {
    const identity = Boolean(field.reference || field.format === 'user')
    columns.push({ header: `${field.label} [${key}${identity ? '; ID' : field.type === 'integer' && key.endsWith('Cents') ? '; cents' : ''}]`, value: record => record.data[key] })
    if (identity) columns.push({ header: `${field.label} [${key}; name]`, value: record => {
      const id = record.data[key]
      if (!id) return ''
      if (field.format === 'user') return membersById.get(String(id)) ?? 'Unavailable member'
      const target = recordsById.get(String(id))
      return target && target.capability === field.reference ? String(target.data.title) : 'Unavailable record'
    } })
  }
  return '\uFEFF' + [columns.map(column => csvCell(column.header)).join(','), ...rows.map(record => columns.map(column => csvCell(column.value(record))).join(','))].join('\r\n') + '\r\n'
}

export function exportFilename(name: string, now = new Date()) {
  const stem = name.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'records'
  return `${stem}-${now.toISOString().slice(0, 10)}.csv`
}
