import type { BusinessRecord, CapabilitySnapshot } from '@/lib/client'
import { Button } from './ui/button'
import { Badge } from './ui/surfaces'
import { ChevronRight, Plus } from 'lucide-react'
import { pluralLabel, statusLabel, statusVariant } from '@/lib/project-ui'

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
  const Heading = groups.length > 1 ? 'h4' : 'h3'
  return <section className="related-records" aria-label="Related records">
    {groups.length > 1 ? <h3>Related records</h3> : null}
    {groups.map(({ capability, related, creatable }) => {
      const label = capability.definition.entity.label
      const collection = pluralLabel(label)
      return <section className="related-record-group" key={capability.slug} aria-label={collection}>
        <header className="related-record-heading"><Heading>{collection}</Heading><span className="muted" aria-label={`${related.length} linked ${related.length === 1 ? 'record' : 'records'}`}>{related.length}</span></header>
        {!related.length ? <p className="muted">No linked records yet.</p> : <ul className="related-record-list">{related.map(item => <li key={item.id}>
          <Button variant="ghost" className="related-record-link" onPress={() => onSelect(item)}>
            <span className="related-record-identity"><span className="related-record-title">{String(item.data.title)}</span>{item.data.status ? <Badge variant={statusVariant(String(item.data.status))}>{statusLabel(String(item.data.status))}</Badge> : null}</span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </li>)}</ul>}
        {onCreate ? <div className="related-record-create">{creatable.map(({ key, field }) => <Button key={key} variant="ghost" size="sm" disabled={busy} onPress={() => onCreate(capability, key)}><Plus data-icon="inline-start" aria-hidden="true" />New {label.toLowerCase()}{creatable.length > 1 ? ` via ${field.label.toLowerCase()}` : ''}</Button>)}</div> : null}
      </section>
    })}
  </section>
}
