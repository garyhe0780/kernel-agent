import { z } from 'zod'
import { clarificationSchema } from './builder-clarification'

export const businessPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(600),
  records: z.string().trim().min(1).max(700),
  workflow: z.string().trim().min(1).max(700),
  rules: z.string().trim().min(1).max(700),
  limitations: z.string().trim().max(700),
}).strict()
export const planningResponseSchema = z.object({
  plan: businessPlanSchema,
  questions: clarificationSchema.shape.questions,
}).strict()
export const planningContentSchema = z.object({
  needsProposal: z.boolean().optional(),
  request: z.string().trim().min(10).max(4000),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(6000) }).strict()).max(40),
  answers: z.record(z.string(), z.string().max(500)),
  proposal: planningResponseSchema.nullable(),
}).strict()
export type PlanningContent = z.infer<typeof planningContentSchema>
export type BusinessPlan = z.infer<typeof businessPlanSchema>
export type BuilderPlan = { id: string; draftId: string | null; draftVersion: number | null; content: PlanningContent; version: number; status: string; updatedAt: string }
export function planBrief(plan: BusinessPlan) {
  return `Build the following confirmed application plan. Honor its explicitly agreed limits.\nName: ${plan.name}\nPurpose: ${plan.summary}\nRecords: ${plan.records}\nWorkflow: ${plan.workflow}\nRules: ${plan.rules}\nLimitations: ${plan.limitations || 'None stated.'}`
}
