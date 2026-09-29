import { applySettings } from './definition'
import { InputError } from './errors'
import { validateAssembly, type Assembly } from './assembly'
import { composeSurface } from './blocks'
import { moduleCatalog, portRequired } from './modules'
import type { ModuleCatalog } from './module-contract'
import { patternById, type KernelPattern } from './patterns'
import { isWorkingGrammar } from './grammars'

function assemblyFrom(pattern: KernelPattern): Assembly {
  return validateAssembly({
    pattern: pattern.id,
    name: pattern.name,
    description: pattern.description,
    assumptions: pattern.assumptions,
    modules: pattern.modules,
    links: pattern.links,
    surfaces: pattern.surfaces,
    startView: pattern.home,
  })
}

export function assemblePattern(id: string): Assembly {
  const pattern = patternById(id)
  if (!pattern) throw new InputError(`Unknown pattern: ${id}`)
  return assemblyFrom(pattern)
}

export function purchasingAssembly(): Assembly {
  return assemblePattern('purchasing')
}

export function salesAssembly(): Assembly {
  return assemblePattern('crm')
}

export function linearAssembly(): Assembly {
  return assemblePattern('issues')
}

export function paymentsAssembly(): Assembly {
  return assemblePattern('payments')
}

export function supportAssembly(): Assembly {
  return assemblePattern('support')
}

export function materializeAssembly(raw: unknown, catalog: ModuleCatalog = moduleCatalog) {
  const assembly = validateAssembly(raw, catalog)
  const instances = assembly.modules.map(item => ({ item, mod: catalog.get(item.use, item.version)! }))
  const entities = instances.map(({ item, mod }) => {
    const definition = structuredClone(mod.definition)
    definition.slug = item.as
    if (item.name) definition.name = item.name
    if (item.label) {
      definition.entity.label = item.label
      if (definition.entity.fields.title) definition.entity.fields.title = { ...definition.entity.fields.title, label: `${item.label} name` }
    }
    const compiled = structuredClone(applySettings(definition, { ...definition.settings, ...item.settings }))
    for (const link of assembly.links) {
      const [alias, field] = link.from.split('.')
      if (alias !== item.as) continue
      const port = mod.ports.find(entry => entry.field === field)!
      compiled.entity.fields[field] = { label: port.label, type: 'string', required: portRequired(port), editable: true, reference: link.to, ...(port.referenceMatch ? { referenceMatch: port.referenceMatch } : {}) }
    }
    if (mod.recordEditing) {
      if (compiled.actions.some(action => action.name === 'edit')) throw new InputError('The edit action is reserved when recordEditing is enabled.')
      const editable = Object.entries(compiled.entity.fields).filter(([, field]) => field.editable)
      compiled.actions.push({
        name: 'edit', label: `Edit ${compiled.entity.label.toLowerCase()}`, description: 'Update record details. Lifecycle status is changed separately.',
        humanExecution: 'direct', roles: ['owner', 'operator'],
        input: Object.fromEntries(editable.map(([key, field]) => [key, { ...field, required: true }])),
        preconditions: [], policies: [], effects: Object.fromEntries(editable.map(([key]) => [key, `$input.${key}`])),
      })
    }
    return compiled
  })
  const byAlias = new Map(instances.map(entry => [entry.item.as, entry.mod]))
  const entityByAlias = new Map(entities.map(entity => [entity.slug, entity]))
  const knownFields = (alias: string) => entityByAlias.get(alias)!.entity.fields
  const views = assembly.surfaces.flatMap(surface => {
    if (surface.grammar === 'detail' || !surface.view) return []
    composeSurface(surface.grammar)
    const view = byAlias.get(surface.of)!.views.find(entry => entry.id === surface.view)!
    const fields = knownFields(surface.of)
    return [{
      ...view,
      name: surface.name ?? view.name,
      entity: surface.of,
      grammar: isWorkingGrammar(surface.grammar) ? surface.grammar : view.grammar,
      columns: view.columns.filter(key => Object.hasOwn(fields, key)),
    }]
  })
  const layouts = assembly.surfaces.flatMap(surface => {
    if (surface.grammar !== 'detail') return []
    composeSurface(surface.grammar)
    const fields = knownFields(surface.of)
    const layout = byAlias.get(surface.of)!.layout!
    return [{
      entity: surface.of,
      sections: layout.sections.map(section => ({ ...section, fields: section.fields.filter(key => Object.hasOwn(fields, key)) })).filter(section => section.fields.length),
    }]
  })
  const navigation = instances.map(({ item, mod }) => {
    const labeled = assembly.surfaces.find(surface => surface.of === item.as && surface.label)
    return { entity: item.as, label: labeled?.label ?? item.name ?? item.label ?? mod.definition.name }
  })
  return {
    name: assembly.name,
    description: assembly.description,
    assumptions: assembly.assumptions,
    entities,
    views,
    layouts,
    navigation,
    startView: assembly.startView ?? null,
  }
}
