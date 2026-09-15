import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel, Textarea } from './ui/form-field'
import type { BuilderClarification } from '@/kernel/builder-clarification'

export function BuilderQuestions({ plan, answers, onAnswer, onBuild, onAssumptions, onBack, busy }: { plan: BuilderClarification; answers: Record<string, string>; onAnswer: (id: string, answer: string) => void; onBuild: () => void; onAssumptions: () => void; onBack: () => void; busy: boolean }) {
  return <section className="builder-questions" aria-label="Clarify your application"><h3>A few decisions before building</h3><p>{plan.summary}</p>
    <FieldGroup>{plan.questions.map(question => <div className="builder-question" key={question.id}><Field value={answers[question.id] ?? ''} onChange={answer => onAnswer(question.id, answer)} isDisabled={busy} maxLength={500}><FieldLabel>{question.question}</FieldLabel><Textarea /></Field><p className="muted">{question.reason}</p><p className="muted">Suggested assumption: {question.suggestedAnswer}</p><Button variant="ghost" size="sm" disabled={busy} onPress={() => onAnswer(question.id, question.suggestedAnswer)}>Use this answer</Button></div>)}</FieldGroup>
    <p className="muted">Answers are added to your description and saved with the generated draft. Until then, they are unsaved.</p>
    <div className="builder-actions"><Button disabled={busy || plan.questions.some(question => !answers[question.id]?.trim())} onPress={onBuild}>Build with these answers</Button><Button variant="outline" disabled={busy} onPress={onAssumptions}>Use suggested assumptions</Button><Button variant="ghost" disabled={busy} onPress={onBack}>Back to description</Button></div>
    <p className="muted">Using assumptions keeps your written answers and uses suggestions for unanswered questions. Review the resulting draft before publishing.</p>
  </section>
}
