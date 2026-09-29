import { useState } from 'react'
import { Button } from './ui/button'
import { RecordFields } from './kernel-dialogs'
import { recordSections, type RecordLayout } from '@/kernel/application-layouts'
import type { Definition, RecordData } from '@/kernel/definition'
import type { BusinessRecord } from '@/lib/client'
import { statusLabel } from '@/lib/project-ui'

export function RecordDetail({ definition, data, records, layout }: { definition: Definition; data: RecordData; records: BusinessRecord[]; layout?: RecordLayout }) {
  const [showAll, setShowAll] = useState(false)
  const all = recordSections(definition, layout)
  const matching = recordSections(definition, layout, data)
  const conditionOf = (id: string) => layout?.sections.find(item => item.id === id)?.when
  const hiddenSections = all.filter(section => conditionOf(section.id) && !matching.some(visible => visible.id === section.id))
  const hiddenDescription = hiddenSections.map(section => {
    const condition = conditionOf(section.id)!
    const field = definition.entity.fields[condition.field]?.label ?? condition.field
    const value = condition.field === 'status' ? statusLabel(String(condition.value)) : String(condition.value)
    const operator = { eq: 'is', neq: 'is not', lte: 'is at most', gte: 'is at least' }[condition.operator]
    return `${section.name || 'Additional details'} appears when ${field} ${operator} ${value}.`
  }).join(' ')
  return <div className="record-sections">{!matching.length && !showAll ? <p className="muted">No sections are shown for this record. Show the additional sections to inspect its fields.</p> : null}{(showAll ? all : matching).map(section => <section key={section.id} aria-label={section.name || 'Record fields'}>{section.name ? <h3>{section.name}</h3> : null}<RecordFields definition={{ ...definition, entity: { ...definition.entity, fields: Object.fromEntries(section.fields.map(key => [key, definition.entity.fields[key]])) } }} data={data} records={records} showEmpty={Boolean(layout)} /></section>)}{hiddenSections.length ? <div className="record-section-visibility"><p className="muted">{showAll ? 'Showing additional sections for reference.' : hiddenDescription}</p><Button variant="ghost" size="sm" onPress={() => setShowAll(value => !value)}>{showAll ? 'Hide additional sections' : 'Show additional sections'}</Button></div> : null}</div>
}
