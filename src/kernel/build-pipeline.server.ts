import { z } from 'zod'
import { assemblySchema, validateAssembly, type Assembly } from './assembly'
import { compileAssembly } from './application'
import { catalogSnapshot } from './modules'
import { modelJson } from './model.server'
import { KernelError } from './errors'
import type { Application } from './application'

export type BuildInput = { brief: string; current?: Application; currentAssembly?: Assembly }
export type Checkpoints = Record<string, unknown>
export type PipelineTask = { key: string; message: string }

const constraints = `You assemble Kernel applications from the catalog. Output a concrete JSON assembly, never a JSON Schema or an entities document. Never invent entities, fields, actions, SQL, integrations or automatic execution.
Choose only listed module ids. Bind every required port with links {from:"alias.field", to:"alias"}. Fill only settings keys declared on those modules. Surfaces may be queue, directory or detail and must use views/layouts those modules provide. Use stable aliases. Preserve an existing assembly on unrelated revisions. State unsupported requirements in assumptions.`

export function nextBuildTask(checkpoints: Checkpoints): PipelineTask {
  if (!checkpoints.assembly) return { key: 'assembly', message: 'Choosing catalog modules and wiring them together.' }
  return { key: 'assemble', message: 'Compiling the application from the catalog assembly.' }
}

export async function executeBuildTask(input: BuildInput, checkpoints: Checkpoints, fetcher: typeof fetch = fetch): Promise<unknown> {
  const task = nextBuildTask(checkpoints)
  if (task.key === 'assemble') return validateAssembly(checkpoints.assembly)
  const catalog = catalogSnapshot()
  const schema = assemblySchema
  const instruction = 'Return only the assembly JSON. Select catalog modules, aliases, links, settings and surfaces. Do not return entities, fields or actions.'
  let invalid: unknown, validationError: string | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const output = await modelJson(`${constraints}\n${instruction}\nCatalog: ${JSON.stringify(catalog)}\nOutput schema: ${JSON.stringify(z.toJSONSchema(schema))}`, {
      task: task.key, brief: input.brief, currentAssembly: input.currentAssembly, currentName: input.current?.name,
      ...(attempt ? { invalid, validationError, repair: 'Repair only this assembly. Keep catalog modules; do not invent entities.' } : {}),
    }, fetcher, 4000)
    try {
      const assembly = validateAssembly(output)
      compileAssembly(assembly)
      return assembly
    } catch (error) { invalid = output; validationError = error instanceof Error ? error.message.slice(0, 3000) : 'Invalid assembly' }
  }
  throw new KernelError('INVALID_MODEL_OUTPUT', 'This task still has validation issues. Earlier completed tasks are saved.', 422, { task: task.key, validationError })
}

export function assembleBuild(input: BuildInput, checkpoints: Checkpoints) {
  if (nextBuildTask(checkpoints).key !== 'assemble') throw new Error('Build tasks are incomplete.')
  return compileAssembly(checkpoints.assembly)
}
