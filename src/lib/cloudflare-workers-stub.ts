/** Node/Vite stand-in for `cloudflare:workers`. The Cloudflare build uses the real module. */
export const env: Record<string, unknown> = {}

export type WorkflowEvent<T> = { payload: T }

export type WorkflowStep = {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>
  sleep(name: string, duration: string | number): Promise<void>
}

export class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
  ctx: unknown
  env: TEnv
  constructor(ctx: unknown, env: TEnv) {
    this.ctx = ctx
    this.env = env
  }
  run(_event: WorkflowEvent<TParams>, _step: WorkflowStep): Promise<void> {
    return Promise.resolve()
  }
}
