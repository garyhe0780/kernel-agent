export type CommandLayer = 'core' | 'host' | 'fixture'
export type CommandFamily = 'identity' | 'data' | 'execution' | 'versions' | 'audit' | 'grants' | 'planner' | 'demo'
export type CommandActor = 'human' | 'operate-agent' | 'construct-agent'

export type CommandSpec = {
  layer: CommandLayer
  family: CommandFamily
  actors: readonly CommandActor[]
}

/** Closed write surface. Construction and operation share these Kernel methods; agent grants are kind-scoped. */
export const kernelCommands = {
  invite_member: { layer: 'core', family: 'identity', actors: ['human'] },
  revoke_invitation: { layer: 'core', family: 'identity', actors: ['human'] },
  preview_invitation: { layer: 'core', family: 'identity', actors: ['human'] },
  accept_invitation: { layer: 'core', family: 'identity', actors: ['human'] },
  invite_application_user: { layer: 'core', family: 'identity', actors: ['human'] },
  accept_application_invite: { layer: 'core', family: 'identity', actors: ['human'] },
  update_member: { layer: 'core', family: 'identity', actors: ['human'] },
  create_workspace: { layer: 'core', family: 'identity', actors: ['human'] },
  rename_workspace: { layer: 'core', family: 'identity', actors: ['human'] },
  act: { layer: 'core', family: 'execution', actors: ['human'] },
  create: { layer: 'core', family: 'data', actors: ['human'] },
  start_run: { layer: 'core', family: 'execution', actors: ['operate-agent'] },
  manage_run: { layer: 'core', family: 'execution', actors: ['human', 'operate-agent'] },
  execute: { layer: 'core', family: 'execution', actors: ['operate-agent'] },
  stage_create: { layer: 'core', family: 'execution', actors: ['operate-agent'] },
  stage: { layer: 'core', family: 'execution', actors: ['human', 'operate-agent'] },
  review: { layer: 'core', family: 'execution', actors: ['human'] },
  save_draft: { layer: 'core', family: 'versions', actors: ['human', 'construct-agent'] },
  edit_project: { layer: 'core', family: 'versions', actors: ['human', 'construct-agent'] },
  preview_migration: { layer: 'core', family: 'versions', actors: ['human', 'construct-agent'] },
  publish_draft: { layer: 'core', family: 'versions', actors: ['human', 'construct-agent'] },
  publish_settings: { layer: 'core', family: 'versions', actors: ['human'] },
  create_agent_credential: { layer: 'core', family: 'grants', actors: ['human'] },
  revoke_agent_credential: { layer: 'core', family: 'grants', actors: ['human'] },
  save_plan: { layer: 'host', family: 'planner', actors: ['human'] },
  plan_step: { layer: 'host', family: 'planner', actors: ['human'] },
  clarify: { layer: 'host', family: 'planner', actors: ['human'] },
  build: { layer: 'host', family: 'planner', actors: ['human'] },
  retry_build: { layer: 'host', family: 'planner', actors: ['human'] },
  operate: { layer: 'host', family: 'planner', actors: ['human'] },
  test_model_connection: { layer: 'host', family: 'planner', actors: ['human'] },
  example: { layer: 'fixture', family: 'demo', actors: ['human'] },
  install_purchasing_demo: { layer: 'fixture', family: 'demo', actors: ['human'] },
  remove_purchasing_demo: { layer: 'fixture', family: 'demo', actors: ['human'] },
} as const satisfies Record<string, CommandSpec>

export type KernelCommandName = keyof typeof kernelCommands

export function commandAllows(type: string, actor: CommandActor) {
  return (kernelCommands as Record<string, CommandSpec>)[type]?.actors.includes(actor) === true
}
