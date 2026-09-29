import { z } from 'zod'
import { InputError } from './errors'
import { moduleCatalog, portRequired, viewGrammar } from './modules'
import type { ModuleCatalog } from './module-contract'
import { grammarFromLegacyKind, grammarIds, isGrammarId } from './grammars'
import { patternById } from './patterns'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const linkFrom = z.string().regex(/^[a-z][a-z0-9_]{0,39}\.[a-z][a-zA-Z0-9_]{0,49}$/)

const surfaceSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const surface = value as Record<string, unknown>
  if (typeof surface.grammar === 'string') {
    const { kind: _kind, ...rest } = surface
    return rest
  }
  if (typeof surface.kind === 'string') {
    const { kind, ...rest } = surface
    return { ...rest, grammar: grammarFromLegacyKind(kind, typeof surface.view === 'string' ? surface.view : undefined) }
  }
  return surface
}, z.object({
  grammar: z.enum(grammarIds),
  of: identifier,
  view: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
  label: z.string().trim().min(2).max(60).optional(),
  name: z.string().trim().min(2).max(60).optional(),
}).strict())

export const assemblySchema = z.object({
  pattern: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(500),
  assumptions: z.array(z.string().max(500)).max(12).default([]),
  modules: z.array(z.object({
    use: z.string().min(1).max(80),
    version: z.number().int().positive().default(1),
    as: identifier,
    name: z.string().trim().min(2).max(80).optional(),
    label: z.string().trim().min(2).max(80).optional(),
    settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).strict()).min(1).max(8),
  links: z.array(z.object({ from: linkFrom, to: identifier }).strict()).default([]),
  surfaces: z.array(surfaceSchema).max(24).default([]),
  startView: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).nullable().optional(),
}).strict()

export type Assembly = z.infer<typeof assemblySchema>

export function validateAssembly(raw: unknown, catalog: ModuleCatalog = moduleCatalog): Assembly {
  const assembly = assemblySchema.parse(raw)
  if (assembly.pattern && !patternById(assembly.pattern)) throw new InputError(`Unknown pattern: ${assembly.pattern}`)
  const aliases = new Set<string>()
  const instances = assembly.modules.map(item => {
    if (aliases.has(item.as)) throw new InputError('Module aliases must be unique.')
    aliases.add(item.as)
    const mod = catalog.get(item.use, item.version)
    if (!mod) throw new InputError(`Unknown module: ${item.use}@${item.version}`)
    for (const key of Object.keys(item.settings ?? {})) {
      if (!Object.hasOwn(mod.definition.settings, key)) throw new InputError(`Unknown setting ${key} on ${item.use}.`)
    }
    return { item, mod }
  })
  const byAlias = new Map(instances.map(entry => [entry.item.as, entry]))
  const bound = new Set<string>()
  for (const link of assembly.links) {
    const [alias, field] = link.from.split('.')
    const source = byAlias.get(alias)
    const port = source?.mod.ports.find(item => item.field === field)
    if (!source || !port) throw new InputError(`Link ${link.from} does not match a module port.`)
    const target = byAlias.get(link.to)
    if (!target || (target.mod.id !== port.target || target.mod.version !== port.targetVersion)) throw new InputError(`Link target ${link.to} is not a ${port.target}@${port.targetVersion} module.`)
    if (bound.has(link.from)) throw new InputError(`Port ${field} on ${alias} is already linked.`)
    bound.add(link.from)
  }
  for (const { item, mod } of instances) {
    for (const port of mod.ports) {
      if (portRequired(port) && !bound.has(`${item.as}.${port.field}`)) throw new InputError(`Port ${port.field} on ${item.as} must be linked.`)
    }
  }
  const viewIds = new Set<string>()
  for (const surface of assembly.surfaces) {
    if (!isGrammarId(surface.grammar)) throw new InputError(`Unknown grammar: ${surface.grammar}.`)
    const instance = byAlias.get(surface.of)
    if (!instance) throw new InputError('Surface refers to an unknown module instance.')
    if (surface.grammar === 'detail') {
      if (!instance.mod.layout) throw new InputError('Layout surface requires a module with a record layout.')
      continue
    }
    if (!surface.view) throw new InputError(`Surface ${surface.grammar} needs a view from ${instance.mod.id}.`)
    const view = instance.mod.views.find(item => item.id === surface.view)
    if (!view) throw new InputError(`View ${surface.view} is not provided by ${instance.mod.id}.`)
    const id = surface.view
    if (viewIds.has(id)) throw new InputError('View identifiers must be unique.')
    viewIds.add(id)
  }
  if (assembly.startView && !viewIds.has(assembly.startView)) throw new InputError('Choose an existing assembled view as the starting view.')
  return assembly
}

export function selectionForModules(ids: string[], catalog: ModuleCatalog = moduleCatalog) {
  const ordered: { use: string; version: number }[] = []
  const seen = new Set<string>()
  function add(id: string, version?: number) {
    const mod = version === undefined ? catalog.latest(id) : catalog.get(id, version)
    if (!mod) throw new InputError(`Unknown module: ${id}`)
    const key = `${id}@${mod.version}`
    if (seen.has(key)) return
    seen.add(key)
    ordered.push({ use: id, version: mod.version })
    for (const port of mod.ports) {
      if (portRequired(port)) add(port.target, port.targetVersion)
    }
  }
  for (const id of ids) add(id)
  return {
    name: 'New application',
    description: 'Assembled from Kernel catalog modules.',
    modules: ordered.map(({ use, version }) => {
      const mod = catalog.get(use, version)!
      return {
        use,
        version,
        as: mod.defaultAlias,
        settings: Object.keys(mod.definition.settings).length ? { ...mod.definition.settings } : undefined,
      }
    }),
  }
}

function homeView(surfaces: Assembly['surfaces']) {
  return surfaces.find(surface => surface.view && surface.grammar !== 'detail')?.view ?? null
}

export function assembleSelection(input: {
  name: string
  description: string
  assumptions?: string[]
  modules: { use: string; version?: number; as?: string; name?: string; label?: string; settings?: Record<string, string | number | boolean> }[]
}, catalog: ModuleCatalog = moduleCatalog): Assembly {
  const modules = input.modules.map(item => {
    const mod = item.version === undefined ? catalog.latest(item.use) : catalog.get(item.use, item.version)
    if (!mod) throw new InputError(`Unknown module: ${item.use}@${item.version}`)
    return {
      use: item.use,
      version: mod.version,
      as: item.as ?? mod.defaultAlias,
      ...(item.name ? { name: item.name } : {}),
      ...(item.label ? { label: item.label } : {}),
      settings: item.settings ?? (Object.keys(mod.definition.settings).length ? { ...mod.definition.settings } : undefined),
    }
  })
  const links = modules.flatMap(item => {
    const mod = catalog.get(item.use, item.version)!
    return mod.ports.flatMap(port => {
      const matches = modules.filter(entry => entry.use === port.target && entry.version === port.targetVersion)
      if (matches.length > 1) throw new InputError(`Port ${port.field} on ${item.as} must be linked.`)
      if (matches.length === 1) return [{ from: `${item.as}.${port.field}`, to: matches[0].as }]
      if (!portRequired(port)) return []
      throw new InputError(`Port ${port.field} on ${item.as} must be linked.`)
    })
  })
  const surfaces = modules.flatMap(item => {
    const mod = catalog.get(item.use, item.version)!
    return [
      ...mod.views.map(view => ({ grammar: viewGrammar(mod, view), of: item.as, view: view.id, name: view.name })),
      ...(mod.layout ? [{ grammar: 'detail' as const, of: item.as }] : []),
    ]
  })
  return validateAssembly({ name: input.name, description: input.description, assumptions: input.assumptions ?? [], modules, links, surfaces, startView: homeView(surfaces) }, catalog)
}
