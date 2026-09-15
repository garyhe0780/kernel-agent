import { buildIsActive, type BuildJobSnapshot } from '@/kernel/build-job'
import { watchBuildJob } from '@/lib/build-job-stream'
import { BuildProgress } from './build-progress'
import { progressRequest, type BuildProgress as Progress } from '@/lib/progress-stream'
import { Input } from './ui/input'
import { useBlocker } from '@tanstack/react-router'
import { Dialog } from './ui/dialog'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { ProjectBuilder } from './project-builder'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel, Textarea } from './ui/form-field'
import { Alert, Spinner } from './ui/surfaces'
import { request } from '@/lib/client'
import type { Draft } from '@/kernel/application'
import type { BuilderPlan, PlanningContent, BusinessPlan } from '@/kernel/builder-plan'

const labels: Record<keyof BusinessPlan, string> = { name: 'Application name', summary: 'Purpose', records: 'What you track', workflow: 'How work moves', rules: 'Access and approvals', limitations: 'Limits and assumptions' }
const empty: PlanningContent = { request: '', messages: [], answers: {}, proposal: null }

export function ApplicationStudio({ draft: initial, planId, model, onSaved, onClose }: { draft?: Draft; planId?: string; model: { configured: boolean; model: string | null }; onSaved: (draft: Draft) => void; onClose: () => void }) {
  const [job, setJob] = useState<BuildJobSnapshot | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [plan, setPlan] = useState<BuilderPlan>()
  const planRef = useRef<BuilderPlan | undefined>(undefined)
  const [content, setContent] = useState<PlanningContent>(empty)
  const [draft, setDraft] = useState(initial)
  const [previewState, setPreviewState] = useState({ dirty: false, busy: false })
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<Progress[]>([])
  const reportProgress = (event: Progress) => setProgress(previous => previous.at(-1)?.stage === event.stage && previous.at(-1)?.message === event.message ? previous : [...previous, event])
  const [busy, setBusy] = useState('Loading your work…')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const saved = (next: BuilderPlan) => { planRef.current = next; setPlan(next); setContent(next.content); setDirty(false); setAcknowledged(false); if (next.status !== 'building') setJob(null) }
  useEffect(() => {
    let active = true
    request<BuilderPlan[]>('/api/kernel?plans=1').then(plans => {
      if (!active) return
      const found = plans.find(p => planId ? p.id === planId : initial && p.draftId === initial.id)
      if (found) saved(found)
      if (found?.status === 'building') request<BuildJobSnapshot | null>(`/api/kernel?buildForPlan=${encodeURIComponent(found.id)}`).then(job => { if (active) setJob(job) }).catch(e => { if (active) setError(e.message) })
      if (found?.status === 'generated' && !initial) request<{ drafts: Draft[] }>('/api/kernel?drafts=1').then(data => { const generated = data.drafts.find(d => d.id === found.draftId); if (active && generated) { setDraft(generated); setPreview(true) } }).catch(e => { if (active) setError(e.message) })
      if (initial && (!found || found.status === 'generated')) setPreview(true)
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setBusy('') })
    return () => { active = false }
  }, [planId, initial?.id])
  useEffect(() => {
    if (!job || !buildIsActive(job)) return
    const controller = new AbortController()
    let current = job
    const receive = (next: BuildJobSnapshot) => { current = next; if (!controller.signal.aborted) { setJob(next); setReconnecting(false) } }
    const follow = async () => {
      while (!controller.signal.aborted && buildIsActive(current)) {
        try {
          await watchBuildJob(current.id, current.revision, receive, controller.signal)
          if (controller.signal.aborted) return
          // Also handles disconnect after the final result was committed.
          receive(await request<BuildJobSnapshot>(`/api/kernel?buildJob=${encodeURIComponent(current.id)}`))
        } catch { if (!controller.signal.aborted) setReconnecting(true) }
        if (buildIsActive(current) && !controller.signal.aborted) await new Promise<void>(resolve => { const timer = setTimeout(done, 2000); function done() { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() } controller.signal.addEventListener('abort', done, { once: true }) })
      }

    }
    void follow()
    return () => controller.abort()
  }, [job?.id, buildIsActive(job)])
  useEffect(() => {
    if (job?.status !== 'completed') return
    void syncBuild(job.planId).catch(e => setError(e instanceof Error ? e.message : 'Reopen the saved preview.'))
  }, [job?.id, job?.status])
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: () => dirty, withResolver: true })
  function edit(next: PlanningContent) { setContent(next); setDirty(true); setAcknowledged(false) }
  async function save(value = content) {
    const current = planRef.current
    const next = await request<BuilderPlan>('/api/kernel', { type: 'save_plan', ...(current ? { id: current.id, expectedVersion: current.version } : {}), ...(draft ? { draftId: draft.id } : {}), content: value })
    saved(next)
    return next
  }
  async function run(label: string, work: () => Promise<void>) {
    if (busy) return
    setBusy(label); setError(''); setProgress([])
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to continue. Your saved work is available when you return.') } finally { setBusy('') }
  }
  async function propose() {
    const answers = content.proposal?.questions.map(q => `${q.question}\n${content.answers[q.id] || ''}`).join('\n\n')
    const text = content.messages.length || draft ? (answers || message.trim()) : content.request.trim()
    const next = await save({ ...content, request: content.request || `Revise ${draft!.definition.name}.`, messages: [...content.messages, ...(text ? [{ role: 'user' as const, text }] : [])] })
    setMessage('')
    saved(await progressRequest<BuilderPlan>({ type: 'plan_step', id: next.id, expectedVersion: next.version, step: 'propose' }, reportProgress))
  }
  async function syncBuild(id: string) {
    const latest = (await request<BuilderPlan[]>('/api/kernel?plans=1')).find(p => p.id === id)
    if (!latest) throw new Error('Your saved plan could not be found. Reopen the application planner.')
    saved(latest)
    if (latest.status !== 'generated') return false
    const data = await request<{ drafts: Draft[] }>('/api/kernel?drafts=1')
    const generated = data.drafts.find(d => d.id === latest.draftId)
    if (!generated) throw new Error('Your build is saved, but its preview could not be loaded. Check build status to try again.')
    setDraft(generated); onSaved(generated); setPreview(true)
    return true
  }
  async function build() {
    let current = planRef.current!
    if (dirty) current = await save()
    if (current.status !== 'confirmed') {
      current = await request<BuilderPlan>('/api/kernel', { type: 'plan_step', id: current.id, expectedVersion: current.version, step: 'confirm' })
      saved(current)
    }
    setPreview(false)
    const queued = await request<BuildJobSnapshot>('/api/kernel', { type: 'plan_step', id: current.id, expectedVersion: current.version, step: 'build' })
    saved({ ...current, status: 'building', version: queued.planVersion })
    setJob(queued)
  }


  const started = Boolean(plan || content.messages.length || draft)
  const questions = content.proposal?.questions ?? []
  const locked = Boolean(busy) || buildIsActive(job) || (preview && (previewState.dirty || previewState.busy))
  const built = preview && draft && plan?.status === 'generated'
  const canSend = !locked && model.configured && (started ? questions.length ? questions.every(q => content.answers[q.id]?.trim()) : Boolean(message.trim()) || Boolean(plan && !content.proposal) || Boolean(content.needsProposal) || Boolean(error) : content.request.trim().length >= 10)
  const conversation = <section className="studio-conversation" aria-label="Application conversation">
    {!started ? <div className="studio-welcome"><h1>What would you like to manage?</h1><p className="muted">Describe your idea. We’ll shape it together.</p></div> : null}
    {content.messages.length ? <ol className="studio-messages" aria-label="Conversation history">{content.messages.map((m, i) => <li key={i} data-role={m.role}><strong>{m.role === 'user' ? 'You' : 'Kernel'}</strong><p>{m.text}</p></li>)}</ol> : null}
    {error ? <Alert variant="danger">{error}</Alert> : null}
    {busy ? progress.length ? <BuildProgress events={progress} /> : <p role="status"><Spinner /> {busy}</p> : null}
    {job && job.status !== 'completed' ? <section className="build-progress" aria-label="Saved build activity">
      <h2>{job.status === 'failed' ? 'Your build is paused' : job.status === 'superseded' ? 'This build is no longer current' : 'Your application is taking shape'}</h2>
      <p role="status">{reconnecting ? 'Reconnecting to saved progress. Your build continues in the background.' : job.error ? 'Your completed work is saved. Retry the interrupted task or revise the plan.' : job.events.at(-1)?.message}</p>
      <p className="muted">{job.completedTasks.length} {job.completedTasks.length === 1 ? 'task' : 'tasks'} saved. You can close this page and return later.</p>
      <details><summary>Build activity</summary><ol>{job.events.map(event => <li key={event.id}>{event.message}</li>)}</ol></details>
      {job.error ? <Alert variant="danger">{job.error.message}</Alert> : null}
      {job.status === 'failed' ? <Button disabled={Boolean(busy) || dirty} onPress={() => run('Resuming your build…', async () => { const next = await request<BuildJobSnapshot>('/api/kernel', { type: 'retry_build', id: job.id }); setJob(next) })}>Retry failed task</Button> : null}
      {job.status === 'failed' || job.status === 'superseded' ? <Button variant="ghost" disabled={Boolean(busy) || dirty} onPress={() => run('Opening your plan…', async () => { const latest = (await request<BuilderPlan[]>('/api/kernel?plans=1')).find(p => p.id === job.planId); if (latest) saved(await request('/api/kernel', { type: 'plan_step', id: latest.id, expectedVersion: latest.version, step: 'recover' })) })}>Revise the plan</Button> : null}
    </section> : null}
    {content.proposal && !built && !job ? <section className="studio-plan" aria-label="Application plan">
      <h2>Here’s the proposed plan</h2><p className="muted">Edit the details below, or tell me what to change.</p>
      <FieldGroup>{(Object.keys(labels) as (keyof BusinessPlan)[]).map(key => <Field key={key} value={content.proposal!.plan[key]} onChange={value => edit({ ...content, proposal: { ...content.proposal!, plan: { ...content.proposal!.plan, [key]: value } } })} isDisabled={locked} maxLength={key === 'name' ? 80 : key === 'summary' ? 600 : 700}><FieldLabel>{labels[key]}</FieldLabel>{key === 'name' ? <Input /> : <Textarea />}</Field>)}</FieldGroup>
      {content.needsProposal ? <Alert>Your saved changes need an updated plan. Send your changes before building.</Alert> : questions.length ? <p className="muted">A few details to resolve before we build.</p> : <><label className="studio-confirm"><input type="checkbox" checked={acknowledged} disabled={locked} onChange={e => setAcknowledged(e.target.checked)} />I’ve reviewed this plan, including its limits and assumptions.</label><Button disabled={locked || !model.configured || !acknowledged || Boolean(message.trim()) || plan?.status === 'building' || (plan?.status === 'generated')} onPress={() => run('Confirming your plan…', build)}><Check data-icon="inline-start" />Build this application</Button></>}
    </section> : null}
    {built || (preview && draft && !plan) ? <p className="studio-ready">Your application is ready to try. Use the sample records, or tell me what you’d like to change.</p> : null}
    {questions.length ? <FieldGroup>{questions.map(q => <div key={q.id}><Field value={content.answers[q.id] ?? ''} onChange={value => edit({ ...content, answers: { ...content.answers, [q.id]: value } })} isDisabled={locked} maxLength={500}><FieldLabel>{q.question}</FieldLabel><Textarea /></Field><p className="muted">{q.reason}</p><Button variant="ghost" disabled={locked} onPress={() => edit({ ...content, answers: { ...content.answers, [q.id]: q.suggestedAnswer } })}>Use suggestion: {q.suggestedAnswer}</Button></div>)}</FieldGroup> : null}
    <div className="studio-composer">
      {!questions.length ? <Field aria-label={started ? 'Message Kernel' : 'Describe your application'} value={started ? message : content.request} onChange={value => { if (started) { setMessage(value); setDirty(true) } else edit({ ...content, request: value }) }} isDisabled={locked} maxLength={started ? 2000 : 4000}><Textarea placeholder={started ? 'Tell Kernel what to add or adjust…' : 'Describe the application your team needs…'} /></Field> : null}
      <div className="studio-composer-actions"><span className="muted">{started ? 'Kernel' : 'Review a plan before building'}</span><Button disabled={!canSend} onPress={() => run('Shaping your application plan…', propose)}>{started ? questions.length ? 'Send answers' : !message.trim() && (content.needsProposal || error) ? 'Update plan' : 'Send message' : 'Start planning'}<ArrowRight data-icon="inline-end" /></Button></div>
    </div>
    {!model.configured ? <p className="muted studio-connection">Connect a model in workspace settings to chat with Kernel. You can still try the purchasing demo.</p> : null}
    {preview && previewState.dirty ? <p className="muted">Save your preview edits before requesting a change.</p> : null}
    {started || dirty ? <div className="studio-save"><span className="muted" role="status">{dirty ? 'Unsaved changes' : plan ? 'Conversation saved' : 'Draft saved'}</span>{dirty && (content.request.trim().length >= 10 || draft) ? <Button variant="ghost" disabled={locked} onPress={() => run('Saving your work…', async () => { await save({ ...content, request: content.request || `Revise ${draft!.definition.name}.`, messages: [...content.messages, ...(message.trim() ? [{ role: 'user' as const, text: message.trim() }] : [])] }); setMessage('') })}>Save for later</Button> : null}</div> : null}
    {!started ? <div className="studio-examples"><p className="muted">Start with an idea</p><div className="studio-example-prompts">{[
      ['Purchase approvals', 'We need to track purchase requests, suppliers, and approvals before buying.'],
      ['Customer tracking', 'We need to track customers, sales opportunities, and follow-up tasks for our team.'],
      ['Support requests', 'We need to track support requests, assign owners, and manage their status through resolution.'],
    ].map(([label, prompt]) => <Button key={label} variant="outline" disabled={locked} onPress={() => edit({ ...content, request: prompt })}>{label}</Button>)}</div><Button variant="link" disabled={locked} onPress={() => run('Opening purchasing demo…', async () => { const next = await request<Draft>('/api/kernel', { type: 'example' }); setDraft(next); onSaved(next); setDirty(false); setPreview(true) })}>Try purchasing demo<ArrowRight data-icon="inline-end" /></Button><p className="muted">A predefined application you can try and edit.</p></div> : null}
    {!job && plan && (plan.status === 'building' || (!preview && plan.status === 'generated') || Boolean(error)) ? <div className="stack"><p className="muted">Check the saved build status to recover your work.</p><Button variant="outline" disabled={locked} onPress={() => run('Checking build status…', async () => { await syncBuild(plan.id) })}>Check build status</Button>{plan.status === 'building' ? <Button variant="outline" disabled={locked} onPress={() => run('Recovering your plan…', async () => saved(await request('/api/kernel', { type: 'plan_step', id: plan.id, expectedVersion: plan.version, step: 'recover' })))}>Recover plan</Button> : null}</div> : null}
  </section>
  return <section className={`application-studio ${preview && draft ? 'studio-preview' : started ? 'studio-started' : 'studio-intro'}`} aria-label="Application creator">
    <div className="studio-toolbar"><span>{draft?.definition.name ?? 'New application'}</span><div className="actions">{dirty ? <Button variant="ghost" disabled={locked} onPress={() => { setContent(planRef.current?.content ?? empty); setMessage(''); setDirty(false); setAcknowledged(false) }}>Discard unsaved edits</Button> : null}<Button variant="ghost" disabled={Boolean(busy) || dirty || (preview && (previewState.dirty || previewState.busy))} onPress={onClose}>Close</Button></div></div>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }} title="Keep your planning edits?" description="Save your edits before leaving, or discard only the unsaved changes."><div className="actions"><Button onPress={() => blocker.reset?.()}>Keep editing</Button><Button variant="outline" onPress={() => blocker.proceed?.()}>Leave without saving</Button></div></Dialog>
    {preview && draft ? <ProjectBuilder onStateChange={setPreviewState} draft={draft} model={model} planned conversation={conversation} publicationBlocked={dirty || Boolean(busy) || Boolean(plan && plan.status !== 'generated')} onSaved={next => { setDraft(next); onSaved(next) }} onClose={onClose} /> : <div className="studio-thread">{conversation}</div>}
  </section>
}
