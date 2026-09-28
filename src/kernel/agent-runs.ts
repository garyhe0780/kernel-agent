import { z } from 'zod'

const common = {
  capability: z.string().min(1).max(200),
  input: z.record(z.string(), z.unknown()).default({}),
  execution: z.enum(['review', 'automatic']).default('review'),
}
const step = z.discriminatedUnion('operation', [
  z.object({ ...common, operation: z.literal('create') }).strict(),
  z.object({ ...common, operation: z.literal('action'), action: z.string().min(1),
    record: z.union([z.string().min(1), z.object({ step: z.number().int().min(0) }).strict()]),
  }).strict(),
])
export const agentRunSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  steps: z.array(step).min(1).max(25),
}).strict()
export const agentRunCommandSchema = z.object({
  runId: z.string().min(1).max(200),
  command: z.enum(['get', 'advance', 'cancel', 'retry']).default('get'),
}).strict()
export type RunReceipt = { changeId: string; recordId: string }

export function runRecovery(status: string, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (status === 'cancelled') return { canRetry: false, message: 'Cancelled. Applied changes remain; pending proposals were rejected. Start a new task for further work.' }
  if (status === 'completed') return { canRetry: false, message: 'All steps applied.' }
  if (status === 'waiting') return { canRetry: false, message: 'Review the pending proposal. Approval lets the worker continue; rejection stops the run.' }
  if (status !== 'failed') return { canRetry: false, message: 'Waiting for the worker to continue.' }
  if (code === 'RUN_EXPIRED') return { canRetry: false, message: 'The seven-day deadline passed. Applied changes remain; start a revised task.' }
  if (code === 'PROPOSAL_REJECTED') return { canRetry: false, message: 'A proposal was rejected. Start a revised task; retrying cannot change that decision.' }
  if (['INVALID_CREDENTIAL', 'AGENT_SCOPE', 'UNAUTHORIZED', 'FORBIDDEN', 'STALE_DEFINITION', 'STALE_AGENT_SCOPE', 'AGENT_REVOKED', 'AGENT_EXPIRED'].includes(code)) return { canRetry: false, message: 'Check agent access and the application definition, then start a new task with valid access.' }
  return { canRetry: true, message: 'Resolve the reported problem, then retry from the saved step. Applied steps will not be repeated. If the proposal is stale, cancel and start a revised task.' }
}
