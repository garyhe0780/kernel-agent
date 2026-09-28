import type { CatalogSnapshot } from '@/kernel/modules'
import { Field, FieldGroup, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'
import { Textarea } from './ui/form-field'

export type ModuleSelection = {
  name: string
  description: string
  modules: { use: string; version?: number; as: string; name?: string; label?: string; settings?: Record<string, string | number | boolean> }[]
}

export function ModulePicker({ catalog, value, onChange, disabled }: {
  catalog: CatalogSnapshot[]
  value: ModuleSelection
  onChange: (next: ModuleSelection) => void
  disabled?: boolean
}) {
  function selected(id: string) {
    return value.modules.find(item => item.use === id)
  }
  function toggle(mod: CatalogSnapshot, checked: boolean) {
    if (checked) {
      const added = [{ use: mod.id, version: mod.version, as: selected(mod.id)?.as ?? mod.defaultAlias, settings: Object.keys(mod.settings).length ? { ...mod.settings } : undefined }]
      for (const port of mod.ports) {
        if (port.required === false) continue
        if (value.modules.some(item => item.use === port.target) || added.some(item => item.use === port.target)) continue
        const target = catalog.find(item => item.id === port.target && item.version === port.targetVersion)
        if (target) added.push({ use: target.id, version: target.version, as: target.defaultAlias, settings: Object.keys(target.settings).length ? { ...target.settings } : undefined })
      }
      onChange({ ...value, modules: [...value.modules.filter(item => !added.some(entry => entry.use === item.use)), ...added] })
      return
    }
    const remove = new Set([mod.id, ...catalog.filter(item => item.ports.some(port => port.target === mod.id && port.required !== false)).map(item => item.id)])
    onChange({ ...value, modules: value.modules.filter(item => !remove.has(item.use)) })
  }
  function update(id: string, patch: Partial<ModuleSelection['modules'][number]>) {
    onChange({ ...value, modules: value.modules.map(item => item.use === id ? { ...item, ...patch } : item) })
  }
  const visibleCatalog = catalog.filter(mod => {
    const item = selected(mod.id)
    const version = item ? item.version ?? 1 : Math.max(...catalog.filter(entry => entry.id === mod.id).map(entry => entry.version))
    return mod.version === version
  })
  return (
    <div className="module-picker">
      <FieldGroup>
        <Field value={value.name} isDisabled={disabled} maxLength={80} onChange={name => onChange({ ...value, name })}>
          <FieldLabel>Application name</FieldLabel>
          <Input />
        </Field>
        <Field value={value.description} isDisabled={disabled} maxLength={500} onChange={description => onChange({ ...value, description })}>
          <FieldLabel>What this application is for</FieldLabel>
          <Textarea />
        </Field>
      </FieldGroup>
      <fieldset className="module-catalog" disabled={disabled}>
        <legend>Catalog modules</legend>
        <p className="muted">Select modules. Required links and views are wired automatically. This is not a page canvas.</p>
        {visibleCatalog.map(mod => {
          const item = selected(mod.id)
          return (
            <div className="module-option" key={mod.id}>
              <label>
                <input type="checkbox" checked={Boolean(item)} onChange={event => toggle(mod, event.target.checked)} />
                <span><strong>{mod.name}</strong><span className="muted">{mod.description}</span></span>
              </label>
              {item ? (
                <FieldGroup>
                  <Field value={item.as} isDisabled={disabled} maxLength={40} onChange={as => update(mod.id, { as })}>
                    <FieldLabel>Alias</FieldLabel>
                    <Input />
                  </Field>
                  {Object.entries(mod.settings).map(([key, current]) => {
                    const stored = item.settings?.[key] ?? current
                    if (typeof current === 'boolean') return <label className="module-setting" key={key}><input type="checkbox" checked={Boolean(stored)} disabled={disabled} onChange={event => update(mod.id, { settings: { ...item.settings, [key]: event.target.checked } })} />{key === 'requireVerifiedSupplier' ? 'Require a verified supplier' : key}</label>
                    if (typeof current === 'number') return <Field key={key} type="number" value={String(key.endsWith('Cents') ? Number(stored) / 100 : stored)} isDisabled={disabled} onChange={next => update(mod.id, { settings: { ...item.settings, [key]: key.endsWith('Cents') ? Math.round(Number(next) * 100) : Number(next) } })}><FieldLabel>{key === 'approvalLimitCents' ? 'Approval ceiling (USD)' : key}</FieldLabel><Input step={key.endsWith('Cents') ? '0.01' : '1'} /></Field>
                    return <Field key={key} value={String(stored ?? '')} isDisabled={disabled} onChange={next => update(mod.id, { settings: { ...item.settings, [key]: next } })}><FieldLabel>{key}</FieldLabel><Input /></Field>
                  })}
                </FieldGroup>
              ) : null}
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}
