import { z } from 'zod'

export const clarificationSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  questions: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    question: z.string().trim().min(5).max(240),
    reason: z.string().trim().min(1).max(240),
    suggestedAnswer: z.string().trim().min(1).max(300),
  }).strict()).max(3),
}).strict().refine(value => new Set(value.questions.map(question => question.id)).size === value.questions.length, 'Question identifiers must be unique.')
export type BuilderClarification = z.infer<typeof clarificationSchema>

export function clarifiedBrief(brief: string, plan: BuilderClarification, answers: Record<string, string>, useAssumptions = false) {
  const valid = clarificationSchema.parse(plan)
  const decisions = valid.questions.map(question => {
    const answer = answers[question.id]?.trim()
    if (!answer && !useAssumptions) throw new Error('Answer each question, or choose Use suggested assumptions.')
    if (answer && answer.length > 500) throw new Error('Keep each answer within 500 characters.')
    return `${question.question}\n${answer ? `Answer: ${answer}` : `Suggested assumption (not confirmed): ${question.suggestedAnswer}`}`
  })
  const result = [brief.trim(), ...(decisions.length ? ['Business decisions:\n' + decisions.join('\n\n')] : [])].join('\n\n')
  if (result.length > 4000) throw new Error('The description and answers exceed 4,000 characters. Shorten the description or answers, then try again.')
  return result
}
