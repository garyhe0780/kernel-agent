import { z } from 'zod'
import { moduleById } from './modules'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const linkFrom = z.string().regex(/^[a-z][a-z0-9_]{0,39}\.[a-z][a-zA-Z0-9_]{0,49}$/)

export const assemblySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(500),
  assumptions: z.array(z.string().max(500)).max(12).default([]),
  modules: z.array(z.object({
    use: z.string().min(1).max(80),
    as: identifier,
    name: z.string().trim().min(2).max(80).optional(),
    label: z.string().trim().min(2).max(80).optional(),
    settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).strict()).min(1).max(8),
  links: z.array(z.object({ from: linkFrom, to: identifier }).strict()).default([]),
  surfaces: z.array(z.object({
    kind: z.enum(['queue', 'directory', 'detail']),
    of: identifier,
    view: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
    label: z.string().trim().min(2).max(60).optional(),
    name: z.string().trim().min(2).max(60).optional(),
  }).strict()).max(24).default([]),
  startView: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).nullable().optional(),
}).strict()

export type Assembly = z.infer<typeof assemblySchema>

export function validateAssembly(raw: unknown): Assembly {
  const assembly = assemblySchema.parse(raw)
  const aliases = new Set<string>()
  const instances = assembly.modules.map(item => {
    if (aliases.has(item.as)) throw new Error('Module aliases must be unique.')
    aliases.add(item.as)
    const mod = moduleById(item.use)
    if (!mod) throw new Error(`Unknown module: ${item.use}`)
    for (const key of Object.keys(item.settings ?? {})) {
      if (!Object.hasOwn(mod.definition.settings, key)) throw new Error(`Unknown setting ${key} on ${item.use}.`)
    }
    return { item, mod }
  })
  const byAlias = new Map(instances.map(entry => [entry.item.as, entry]))
  const bound = new Set<string>()
  for (const link of assembly.links) {
    const [alias, field] = link.from.split('.')
    const source = byAlias.get(alias)
    const port = source?.mod.ports.find(item => item.field === field)
    if (!source || !port) throw new Error(`Link ${link.from} does not match a module port.`)
    const target = byAlias.get(link.to)
    if (!target || target.mod.id !== port.target) throw new Error(`Link target ${link.to} is not a ${port.target} module.`)
    if (bound.has(link.from)) throw new Error(`Port ${field} on ${alias} is already linked.`)
    bound.add(link.from)
  }
  for (const { item, mod } of instances) {
    for (const port of mod.ports) {
      if (!bound.has(`${item.as}.${port.field}`)) throw new Error(`Port ${port.field} on ${item.as} must be linked.`)
    }
  }
  const viewIds = new Set<string>()
  for (const surface of assembly.surfaces) {
    const instance = byAlias.get(surface.of)
    if (!instance) throw new Error('Surface refers to an unknown module instance.')
    if (surface.kind === 'detail') {
      if (!instance.mod.layout) throw new Error('Layout surface requires a module with a record layout.')
      continue
    }
    if (!surface.view) throw new Error(`Surface ${surface.kind} needs a view from ${instance.mod.id}.`)
    const view = instance.mod.views.find(item => item.id === surface.view)
    if (!view) throw new Error(`View ${surface.view} is not provided by ${instance.mod.id}.`)
    const id = surface.view
    if (viewIds.has(id)) throw new Error('View identifiers must be unique.')
    viewIds.add(id)
  }
  if (assembly.startView && !viewIds.has(assembly.startView)) throw new Error('Choose an existing assembled view as the starting view.')
  return assembly
}

export function selectionForModules(ids: string[]) {
  const ordered: string[] = []
  const seen = new Set<string>()
  function add(id: string) {
    if (seen.has(id)) return
    const mod = moduleById(id)
    if (!mod) throw new Error(`Unknown module: ${id}`)
    seen.add(id)
    ordered.push(id)
    for (const port of mod.ports) add(port.target)
  }
  for (const id of ids) add(id)
  return {
    name: 'New application',
    description: 'Assembled from Kernel catalog modules.',
    modules: ordered.map(use => {
      const mod = moduleById(use)!
      return {
        use,
        as: mod.defaultAlias,
        settings: Object.keys(mod.definition.settings).length ? { ...mod.definition.settings } : undefined,
      }
    }),
  }
}

export function assembleSelection(input: {
  name: string
  description: string
  assumptions?: string[]
  modules: { use: string; as?: string; name?: string; label?: string; settings?: Record<string, string | number | boolean> }[]
}): Assembly {
  const modules = input.modules.map(item => {
    const mod = moduleById(item.use)
    if (!mod) throw new Error(`Unknown module: ${item.use}`)
    return {
      use: item.use,
      as: item.as ?? mod.defaultAlias,
      ...(item.name ? { name: item.name } : {}),
      ...(item.label ? { label: item.label } : {}),
      settings: item.settings ?? (Object.keys(mod.definition.settings).length ? { ...mod.definition.settings } : undefined),
    }
  })
  const links = modules.flatMap(item => {
    const mod = moduleById(item.use)!
    return mod.ports.map(port => {
      const matches = modules.filter(entry => entry.use === port.target)
      if (matches.length !== 1) throw new Error(`Port ${port.field} on ${item.as} must be linked.`)
      return { from: `${item.as}.${port.field}`, to: matches[0].as }
    })
  })
  const surfaces = modules.flatMap(item => {
    const mod = moduleById(item.use)!
    const kind = mod.ports.length ? 'queue' as const : 'directory' as const
    return [
      ...mod.views.map(view => ({ kind, of: item.as, view: view.id, name: view.name })),
      ...(mod.layout ? [{ kind: 'detail' as const, of: item.as }] : []),
    ]
  })
  const queuedViews = surfaces.flatMap(surface => surface.kind === 'queue' ? [surface.view] : [])
  const startView = queuedViews[0] ?? surfaces.flatMap(surface => surface.kind === 'detail' ? [] : [surface.view])[0] ?? null
  return validateAssembly({ name: input.name, description: input.description, assumptions: input.assumptions ?? [], modules, links, surfaces, startView })
}
