import { useState } from 'react'
import { Button } from './ui/button'
import { RecordFields } from './kernel-dialogs'
import { recordSections, type RecordLayout } from '@/kernel/application-layouts'
import type { Definition, RecordData } from '@/kernel/definition'
import type { BusinessRecord } from '@/lib/client'

export function RecordDetail({ definition, data, records, layout }: { definition: Definition; data: RecordData; records: BusinessRecord[]; layout?: RecordLayout }) {
  const [showAll, setShowAll] = useState(false)
  const all = recordSections(definition, layout)
  const matching = recordSections(definition, layout, data)
  const hidden = all.length - matching.length
  return <div className="record-sections">{hidden ? <div className="record-section-visibility"><p className="muted">{hidden} {hidden === 1 ? 'section does' : 'sections do'} not match this record.</p><Button variant="ghost" size="sm" onPress={() => setShowAll(value => !value)}>{showAll ? 'Use section conditions' : 'Show all sections'}</Button></div> : null}{!matching.length && !showAll ? <p className="muted">No sections match. Show all sections to inspect the record.</p> : null}{(showAll ? all : matching).map(section => <section key={section.id} aria-label={section.name || 'Record fields'}>{section.name ? <h3>{section.name}</h3> : null}<RecordFields definition={{ ...definition, entity: { ...definition.entity, fields: Object.fromEntries(section.fields.map(key => [key, definition.entity.fields[key]])) } }} data={data} records={records} showEmpty={Boolean(layout)} /></section>)}</div>
}
