import { z } from 'zod'
import { agentRunSchema } from './agent-runs'
import { recordQuerySchema } from './record-operations'

export const embeddedOperationSchema = z.object({
  project: z.string().min(1), credentialId: z.string().min(1),
  instruction: z.string().trim().min(5).max(2000),
  idempotencyKey: z.string().min(8).max(100),
  allowAutomatic: z.boolean().default(false),
}).strict()
export const operationPlanSchema = z.object({
  explanation: z.string().min(1).max(1000),
  queries: z.array(recordQuerySchema).max(2),
  steps: z.array(agentRunSchema.shape.steps.element).max(25),
}).strict().refine(plan => !plan.queries.length || !plan.steps.length, 'Return queries or steps, never both.')
