import { SectionConditionEditor } from './section-condition-editor'
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import type { Application } from '@/kernel/application'
import type { RecordLayout } from '@/kernel/application-layouts'
import { fieldLabel } from '@/lib/project-ui'

function reordered<T>(items: T[], index: number, step: number) {
  const next = [...items]
  ;[next[index], next[index + step]] = [next[index + step], next[index]]
  return next
}
export function ApplicationLayoutEditor({ application, onChange, disabled, entityId, onEntityChange }: { entityId: string; onEntityChange: (entity: string) => void; application: Application; onChange: (application: Application) => void; disabled: boolean }) {
  const entity = application.entities.find(entity => entity.slug === entityId) ?? application.entities[0]
  const layout = application.layouts.find(layout => layout.entity === entity.slug)
  const update = (next?: RecordLayout) => onChange({ ...application, layouts: [...application.layouts.filter(layout => layout.entity !== entity.slug), ...(next ? [next] : [])] })
  const unassigned = Object.keys(entity.entity.fields).filter(key => !layout?.sections.some(section => section.fields.includes(key)))
  function moveField(key: string, destination: string) {
    if (!layout) return
    update({ ...layout, sections: layout.sections.map(section => ({ ...section, fields: [...section.fields.filter(field => field !== key), ...(section.id === destination ? [key] : [])] })) })
  }
  return <details className="builder-definition"><summary>Record detail layouts</summary><fieldset className="view-editor" disabled={disabled}><legend className="sr-only">Record layout editor</legend>
    <p className="muted">Group related fields and put them in the order people need them. Unassigned fields remain visible under Other details. Display conditions organize sections; users can still reveal all details.</p>
    <Select label="Layout for" value={entity.slug} onChange={onEntityChange} options={application.entities.map(entity => ({ value: entity.slug, label: entity.entity.label }))} />
    {!layout ? <Button variant="outline" disabled={disabled} onPress={() => update({ entity: entity.slug, sections: [{ id: 'overview', name: 'Overview', fields: Object.keys(entity.entity.fields) }] })}>Customize record details</Button> : <>
      {layout.sections.map((section, index) => <section className="layout-editor-section" key={section.id} aria-label={`${section.name} section editor`}>
        <div className="layout-section-heading"><Field value={section.name} maxLength={60} onChange={name => update({ ...layout, sections: layout.sections.map(item => item.id === section.id ? { ...item, name } : item) })}><FieldLabel>Section {index + 1} name</FieldLabel><Input /></Field><Button variant="outline" size="icon" disabled={disabled || index === 0} aria-label={`Move ${section.name} section up`} onPress={() => update({ ...layout, sections: reordered(layout.sections, index, -1) })}><ArrowUp /></Button><Button variant="outline" size="icon" disabled={disabled || index === layout.sections.length - 1} aria-label={`Move ${section.name} section down`} onPress={() => update({ ...layout, sections: reordered(layout.sections, index, 1) })}><ArrowDown /></Button><Button variant="ghost" size="icon" disabled={disabled || layout.sections.length === 1} aria-label={`Remove ${section.name} section`} onPress={() => update({ ...layout, sections: layout.sections.filter(item => item.id !== section.id) })}><Trash2 /></Button></div>
        <SectionConditionEditor definition={entity} name={section.name} condition={section.when} onChange={when => update({ ...layout, sections: layout.sections.map(item => item.id === section.id ? { ...item, when } : item) })} />
        {!section.fields.length ? <p className="muted">Move fields here using their Section menu. Empty sections are not shown in record details.</p> : section.fields.map((key, position) => <div className="layout-field-row" key={key}><span>{fieldLabel(key, entity.entity.fields[key].label)}</span><Select label={`Section for ${fieldLabel(key, entity.entity.fields[key].label)}`} value={section.id} onChange={destination => moveField(key, destination)} options={[...layout.sections.map(section => ({ value: section.id, label: section.name })), { value: '$remaining', label: 'Other details' }]} /><Button variant="ghost" size="icon" disabled={disabled || position === 0} aria-label={`Move ${fieldLabel(key, entity.entity.fields[key].label)} up`} onPress={() => update({ ...layout, sections: layout.sections.map(item => item.id === section.id ? { ...item, fields: reordered(item.fields, position, -1) } : item) })}><ArrowUp /></Button><Button variant="ghost" size="icon" disabled={disabled || position === section.fields.length - 1} aria-label={`Move ${fieldLabel(key, entity.entity.fields[key].label)} down`} onPress={() => update({ ...layout, sections: layout.sections.map(item => item.id === section.id ? { ...item, fields: reordered(item.fields, position, 1) } : item) })}><ArrowDown /></Button></div>)}
      </section>)}
      {unassigned.length ? <section className="layout-editor-section"><h3>Other details</h3>{unassigned.map(key => <Select key={key} label={`Section for ${fieldLabel(key, entity.entity.fields[key].label)}`} value="$remaining" onChange={destination => moveField(key, destination)} options={[{ value: '$remaining', label: 'Other details' }, ...layout.sections.map(section => ({ value: section.id, label: section.name }))]} />)}</section> : null}
      <div className="builder-actions"><Button variant="outline" disabled={disabled || layout.sections.length >= 8} onPress={() => update({ ...layout, sections: [...layout.sections, { id: `section_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`, name: 'New section', fields: [] }] })}><Plus data-icon="inline-start" />Add section</Button><Button variant="ghost" disabled={disabled} onPress={() => update()}>Use default layout</Button></div>
    </>}
  </fieldset></details>
}
