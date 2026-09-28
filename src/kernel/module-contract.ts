import { z } from 'zod'
import { definitionSchema } from './definition'
import { savedViewSchema } from './application-views'
import { recordLayoutSchema } from './application-layouts'
import { workingGrammars } from './grammars'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const moduleId = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/).max(80)
const portSchema = z.object({
  field: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,49}$/),
  target: moduleId,
  targetVersion: z.number().int().positive().default(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
}).strict()

/** Repository-authored declarative modules only. Exact versions are immutable releases. */
export const kernelModuleSchema = z.object({
  contractVersion: z.literal(1),
  id: moduleId,
  version: z.number().int().positive(),
  defaultAlias: identifier,
  definition: definitionSchema,
  ports: z.array(portSchema),
  views: z.array(savedViewSchema.omit({ entity: true })),
  layout: recordLayoutSchema.omit({ entity: true }).optional(),
  grammar: z.enum(workingGrammars).optional(),
}).strict()
export type KernelModule = z.infer<typeof kernelModuleSchema>
export type ModuleSource = z.input<typeof kernelModuleSchema>
export type ModuleCatalog = ReturnType<typeof createModuleCatalog>

export function createModuleCatalog(sources: readonly unknown[]) {
  const modules = sources.map(source => kernelModuleSchema.parse(source))
  const releases = new Map<string, KernelModule>()
  for (const mod of modules) {
    const key = `${mod.id}@${mod.version}`
    if (releases.has(key)) throw new Error(`Duplicate module release: ${key}`)
    releases.set(key, mod)
    const fields = new Set(Object.keys(mod.definition.entity.fields))
    for (const port of mod.ports) {
      if (['__proto__', 'constructor', 'prototype'].includes(port.field) || fields.has(port.field)) throw new Error(`Invalid or duplicate port ${port.field} on ${key}.`)
      fields.add(port.field)
    }
    if (Object.values(mod.definition.entity.fields).some(field => field.reference)) throw new Error(`Module ${key} must declare relationships through ports.`)
    if (new Set(mod.views.map(view => view.id)).size !== mod.views.length) throw new Error(`Duplicate views on ${key}.`)
    for (const view of mod.views) {
      if (view.columns.some(field => !fields.has(field)) || view.filters.some(filter => !fields.has(filter.field)) || (view.sort.field !== '$createdAt' && !fields.has(view.sort.field))) throw new Error(`Unknown view field on ${key}.`)
    }
    if (mod.layout?.sections.some(section => section.fields.some(field => !fields.has(field)))) throw new Error(`Unknown layout field on ${key}.`)
  }
  for (const mod of modules) {
    for (const port of mod.ports) {
      if (!releases.has(`${port.target}@${port.targetVersion}`)) throw new Error(`Missing dependency ${port.target}@${port.targetVersion} for ${mod.id}@${mod.version}.`)
    }
  }
  return {
    // Unversioned stored assemblies always mean release 1, never the newest release.
    get(id: string, version = 1) { const mod = releases.get(`${id}@${version}`); return mod ? structuredClone(mod) : undefined },
    latest(id: string) { const mod = modules.filter(mod => mod.id === id).sort((a, b) => b.version - a.version)[0]; return mod ? structuredClone(mod) : undefined },
    list() { return structuredClone(modules) },
  }
}
