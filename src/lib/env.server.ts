import { env as cloudflareEnv } from 'cloudflare:workers'

export type HyperdriveBinding = { connectionString: string }
export type BuildWorkflowBinding = { create: (opts: { id?: string; params: { jobId: string } }) => Promise<unknown> }

export type KernelEnv = {
  DATABASE_URL?: string
  KERNEL_PGLITE?: string
  KERNEL_PGLITE_DIR?: string
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  RESEND_API_KEY?: string
  KERNEL_EMAIL_FROM?: string
  KERNEL_SIGNUP_CODE?: string
  KERNEL_API_KEY?: string
  OPENAI_API_KEY?: string
  KERNEL_MODEL?: string
  KERNEL_API_BASE_URL?: string
  KERNEL_REASONING_EFFORT?: string
  KERNEL_MODEL_TIMEOUT_MS?: string
  HYPERDRIVE?: HyperdriveBinding
  BUILD_WORKFLOW?: BuildWorkflowBinding
}

export function isCloudflareWorker() {
  return typeof navigator === 'object' && navigator.userAgent === 'Cloudflare-Workers'
}

export function runtimeEnv(): KernelEnv {
  const bindings = cloudflareEnv as KernelEnv
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    KERNEL_PGLITE: process.env.KERNEL_PGLITE,
    KERNEL_PGLITE_DIR: process.env.KERNEL_PGLITE_DIR,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY || bindings.RESEND_API_KEY,
    KERNEL_EMAIL_FROM: process.env.KERNEL_EMAIL_FROM || bindings.KERNEL_EMAIL_FROM,
    KERNEL_SIGNUP_CODE: process.env.KERNEL_SIGNUP_CODE,
    KERNEL_API_KEY: process.env.KERNEL_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    KERNEL_MODEL: process.env.KERNEL_MODEL,
    KERNEL_API_BASE_URL: process.env.KERNEL_API_BASE_URL,
    KERNEL_REASONING_EFFORT: process.env.KERNEL_REASONING_EFFORT,
    KERNEL_MODEL_TIMEOUT_MS: process.env.KERNEL_MODEL_TIMEOUT_MS,
    HYPERDRIVE: bindings.HYPERDRIVE,
    BUILD_WORKFLOW: bindings.BUILD_WORKFLOW,
  }
}

export function authUrl() {
  return runtimeEnv().BETTER_AUTH_URL?.trim() || 'http://localhost:3000'
}

const localOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']

/** Browser origins allowed to make cookie-authenticated writes. Loopback aliases apply only to a loopback deployment. */
export function trustedOrigins(base = authUrl()) {
  const { hostname } = new URL(base)
  const local = hostname === 'localhost' || hostname === '127.0.0.1'
  return [...new Set([new URL(base).origin, ...(local ? localOrigins : [])])]
}

export function postgresConnectionString() {
  const env = runtimeEnv()
  return env.HYPERDRIVE?.connectionString || env.DATABASE_URL?.trim() || ''
}

export function usesEmbeddedPostgres() {
  if (isCloudflareWorker()) return false
  if (runtimeEnv().HYPERDRIVE?.connectionString) return false
  return runtimeEnv().KERNEL_PGLITE !== '0'
}
