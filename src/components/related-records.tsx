import type { BusinessRecord, CapabilitySnapshot } from '@/lib/client'
import { Button } from './ui/button'
import { statusLabel } from '@/lib/project-ui'

/** Reverse relationships are discovered from definitions, without application-specific names. */
export function RelatedRecords({ record, records, capabilities, onSelect, onCreate, busy = false }: {
  record: BusinessRecord
  records: BusinessRecord[]
  capabilities: CapabilitySnapshot[]
  onSelect: (record: BusinessRecord) => void
  onCreate?: (capability: CapabilitySnapshot, field: string) => void
  busy?: boolean
}) {
  const groups = capabilities.flatMap(capability => {
    const references = Object.entries(capability.definition.entity.fields).filter(([, field]) => field.reference === record.capability).map(([key, field]) => ({ key, field }))
    const related = references.length ? records.filter(item => item.capability === capability.slug && references.some(({ key }) => item.data[key] === record.id)) : []
    const creatable = references.filter(({ field }) => field.editable)
    return related.length || (onCreate && creatable.length) ? [{ capability, related, creatable }] : []
  })
  if (!groups.length) return null
  return <section aria-label="Related records">
    <h3>Related records</h3>
    {groups.map(({ capability, related, creatable }) => <section key={capability.slug} aria-label={capability.definition.name}>
      <h4>{capability.definition.name} · {related.length}</h4>
      {onCreate ? creatable.map(({ key, field }) => <Button key={key} variant="outline" size="sm" disabled={busy} onPress={() => onCreate(capability, key)}>New {capability.definition.entity.label.toLowerCase()}{creatable.length > 1 ? ` via ${field.label.toLowerCase()}` : ''}</Button>) : null}
      {!related.length ? <p className="muted">No linked records yet.</p> : null}
      <ul>{related.map(item => <li key={item.id}><Button variant="link" onPress={() => onSelect(item)}>{String(item.data.title)} · {statusLabel(String(item.data.status))}</Button></li>)}</ul>
    </section>)}
  </section>
}
