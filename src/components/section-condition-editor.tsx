import { Field, FieldGroup, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'
import { Select } from './ui/select'
import type { Definition } from '@/kernel/definition'
import type { SectionCondition } from '@/kernel/application-layouts'
import { fieldLabel, statusLabel } from '@/lib/project-ui'

export function SectionConditionEditor({ definition, name, condition, onChange }: { definition: Definition; name: string; condition?: SectionCondition | null; onChange: (condition: SectionCondition | null) => void }) {
  const field = condition ? definition.entity.fields[condition.field] : undefined
  return <div className="section-condition-editor"><Select label={`Show ${name}`} value={condition?.field ?? '$always'} onChange={key => { const next = definition.entity.fields[key]; onChange(key === '$always' ? null : { field: key, operator: 'eq', value: next.type === 'enum' ? next.options![0] : next.type === 'boolean' ? true : next.type === 'integer' ? next.min ?? 0 : '' }) }} options={[{ value: '$always', label: 'Always' }, ...Object.entries(definition.entity.fields).filter(([, field]) => !field.reference).map(([key, field]) => ({ value: key, label: `When ${fieldLabel(key, field.label)}` }))]} />
    {condition && field ? <FieldGroup><Select label={`${name} comparison`} value={condition.operator} onChange={operator => onChange({ ...condition, operator: operator as SectionCondition['operator'] })} options={[{ value: 'eq', label: 'Equals' }, { value: 'neq', label: 'Does not equal' }, ...(field.type === 'integer' ? [{ value: 'lte', label: 'At most' }, { value: 'gte', label: 'At least' }] : [])]} />
      {field.type === 'enum' || field.type === 'boolean' ? <Select label={`${name} value`} value={String(condition.value)} onChange={value => onChange({ ...condition, value: field.type === 'boolean' ? value === 'true' : value })} options={field.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : field.options!.map(value => ({ value, label: statusLabel(value) }))} /> : <Field type={field.type === 'integer' ? 'number' : 'text'} value={String(condition.field.endsWith('Cents') && typeof condition.value === 'number' ? condition.value / 100 : condition.value)} onChange={value => onChange({ ...condition, value: field.type === 'integer' ? condition.field.endsWith('Cents') ? Math.round(Number(value) * 100) : Number(value) : value })}><FieldLabel>{name} value{condition.field.endsWith('Cents') ? ' (USD)' : ''}</FieldLabel><Input step={condition.field.endsWith('Cents') ? '0.01' : '1'} /></Field>}
    </FieldGroup> : null}
  </div>
}
