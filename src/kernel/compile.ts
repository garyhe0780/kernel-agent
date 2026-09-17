import { applySettings } from './definition'
import { validateAssembly, type Assembly } from './assembly'
import { composeSurface } from './blocks'
import { moduleById } from './modules'

export function purchasingAssembly(): Assembly {
  return {
    name: 'Team purchasing',
    description: 'Manage suppliers and purchase requests, with a reviewed decision for every purchase.',
    assumptions: [
      'All purchase decisions require owner review.',
      'Requests above the configured approval ceiling are blocked; this is a hard limit, not an escalation.',
      'Supplier verification is recorded on each request; it is not inferred from the supplier.',
      'Example records are for preview only and will not be published.',
    ],
    modules: [
      { use: 'purchasing.request', as: 'requests', settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true } },
      { use: 'directory.party', as: 'suppliers', name: 'Suppliers', label: 'Supplier' },
    ],
    links: [{ from: 'requests.supplier', to: 'suppliers' }],
    surfaces: [
      { kind: 'queue', of: 'requests', view: 'awaiting_decision', label: 'Purchase requests' },
      { kind: 'directory', of: 'suppliers', view: 'active', label: 'Suppliers', name: 'Active suppliers' },
      { kind: 'detail', of: 'requests' },
    ],
    startView: 'awaiting_decision',
  }
}

export function salesAssembly(): Assembly {
  return {
    name: 'Team sales',
    description: 'Track customers and sales opportunities, with a reviewed conversion for every deal.',
    assumptions: [
      'Conversion and lost decisions require owner review.',
      'Customer details live on the directory record; the opportunity stores the selected customer.',
      'Example records are for preview only and will not be published.',
    ],
    modules: [
      { use: 'sales.opportunity', as: 'opportunities' },
      { use: 'directory.party', as: 'customers', name: 'Customers', label: 'Customer' },
    ],
    links: [{ from: 'opportunities.customer', to: 'customers' }],
    surfaces: [
      { kind: 'queue', of: 'opportunities', view: 'open', label: 'Opportunities' },
      { kind: 'directory', of: 'customers', view: 'active', label: 'Customers', name: 'Active customers' },
      { kind: 'detail', of: 'opportunities' },
    ],
    startView: 'open',
  }
}

export function materializeAssembly(raw: unknown) {
  const assembly = validateAssembly(raw)
  const instances = assembly.modules.map(item => ({ item, mod: moduleById(item.use)! }))
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
      compiled.entity.fields[field] = { label: port.label, type: 'string', required: true, editable: true, reference: link.to }
    }
    return compiled
  })
  const byAlias = new Map(instances.map(entry => [entry.item.as, entry.mod]))
  const views = assembly.surfaces.flatMap(surface => {
    if (surface.kind === 'detail' || !surface.view) return []
    composeSurface(surface.kind)
    const view = byAlias.get(surface.of)!.views.find(entry => entry.id === surface.view)!
    return [{ ...view, name: surface.name ?? view.name, entity: surface.of }]
  })
  const layouts = assembly.surfaces.flatMap(surface => {
    if (surface.kind !== 'detail') return []
    composeSurface(surface.kind)
    return [{ ...byAlias.get(surface.of)!.layout!, entity: surface.of }]
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
