import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { ApplicationStudio } from '../../src/components/application-studio'
import { purchasingExample, type Draft } from '../../src/kernel/application'
import type { BuilderPlan } from '../../src/kernel/builder-plan'
import type { BuildJobSnapshot } from '../../src/kernel/build-job'
import '../../src/styles.css'

// Synthetic transport only: no model, database, or publication endpoint is reached.
const stored = JSON.parse(sessionStorage.getItem('studio-build-fixture') || '{}')
let plan: BuilderPlan | undefined = stored.plan
let draft: Draft | undefined = stored.draft
let job: BuildJobSnapshot | undefined = stored.job
let published = false
const persist = () => sessionStorage.setItem('studio-build-fixture', JSON.stringify({ plan, draft, job }))
const proposal = { plan: { name: 'Team purchasing', summary: 'Track purchases from request to approval.', records: 'Purchase requests and suppliers.', workflow: 'Submit a request, review it, then approve or reject it.', rules: 'Owners review purchase requests before approval.', limitations: 'No payments or external integrations.' }, questions: [] }
const makeDraft = (): Draft => ({ id: 'conversation-draft', brief: plan?.content.request ?? 'Purchasing example', definition: purchasingExample(), version: (draft?.version ?? 0) + 1, status: 'draft', source: 'example', projectSlug: null, baseProjectVersion: null, updatedAt: new Date().toISOString() })
function simulateBuild(retry = false) {
  setTimeout(() => {
    if (!job || !plan || !['queued', 'running'].includes(job.status)) return
    job.status = retry ? 'completed' : 'failed'
    job.revision++
    if (retry) {
      draft = makeDraft(); job.draftId = draft.id; job.completedTasks = ['structure', 'fields:requests', 'behavior:requests', 'presentation']; job.error = null
      plan.status = 'generated'; plan.draftId = draft.id; plan.version++
    } else {
      job.completedTasks = ['structure']; job.task = 'fields:requests'; job.error = { code: 'MODEL_INCOMPLETE', message: 'Synthetic interruption while creating purchase request fields. Completed tasks are saved.' }
    }
    job.events.push({ id: job.events.length + 1, task: job.task, message: retry ? 'Your application is ready to try. Nothing has been published.' : job.error!.message, at: new Date().toISOString() }); persist()
  }, 1800)
}
if (job && ['queued', 'running'].includes(job.status)) simulateBuild(job.completedTasks.length > 0)
window.fetch = async (_url, options) => {
  const url = String(_url), body = JSON.parse(String(options?.body || '{}'))
  let result: unknown
  if (!options?.method) {
    if (url.includes('buildForPlan=')) result = job ?? null
    else if (url.includes('buildJob=')) {
      if (new Headers(options?.headers).get('Accept') === 'text/event-stream') {
        let timer: ReturnType<typeof setInterval>
        return new Response(new ReadableStream({ start(controller) {
          let last = 0
          timer = setInterval(() => {
            if (job && job.revision !== last) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(job)}\n\n`)); last = job.revision }
            if (job && !['queued', 'running'].includes(job.status)) { clearInterval(timer); controller.close() }
          }, 100)
        }, cancel() { clearInterval(timer) } }), { headers: { 'Content-Type': 'text/event-stream' } })
      }
      result = job
    } else result = url.includes('plans=1') ? (plan ? [plan] : []) : { drafts: draft ? [draft] : [] }
  } else if (body.type === 'save_plan') {
    plan = { id: 'conversation-plan', version: (plan?.version ?? 0) + 1, status: 'planning', draftId: draft?.id ?? null, draftVersion: draft?.version ?? null, content: body.content, updatedAt: new Date().toISOString() }; result = plan
  } else if (body.type === 'plan_step' && plan) {
    if (body.step === 'propose') { plan.content.proposal = proposal; plan.content.messages.push({ role: 'assistant', text: 'Here’s a plan for your purchasing application. Review the details and tell me what to adjust.' }); plan.status = 'planning' }
    if (body.step === 'confirm') plan.status = 'confirmed'
    if (body.step === 'recover') { plan.status = 'planning'; job = undefined }
    plan.version++
    if (body.step === 'build') {
      if (plan.status !== 'confirmed') return Response.json({ error: 'Confirm the plan first.' }, { status: 409 })
      plan.status = 'building'
      job = { id: `job-${plan.version}`, planId: plan.id, planVersion: plan.version, status: 'queued', revision: 1, task: 'structure', completedTasks: [], draftId: null, error: null, events: [{ id: 1, task: 'structure', message: 'Build queued. You can close this page and return later.', at: new Date().toISOString() }] }
      result = job; simulateBuild()
    } else result = plan
  } else if (body.type === 'retry_build' && job) { job.status = 'queued'; job.error = null; job.revision++; job.events.push({ id: job.events.length + 1, task: job.task, message: 'Retry queued. Completed tasks will be reused.', at: new Date().toISOString() }); result = job; simulateBuild(true) }
  else if (body.type === 'example') { draft = makeDraft(); result = draft }
  else if (body.type === 'save_draft' && draft) { draft = { ...draft, definition: body.definition, brief: body.brief, version: draft.version + 1 }; result = draft }
  else if (body.type === 'publish_draft') { published = true; result = { slug: 'fixture-purchasing' } }
  else return Response.json({ error: 'Unsupported fixture request' }, { status: 400 })
  persist()
  return new Headers(options?.headers).get('Accept') === 'text/event-stream' ? new Response(`data: ${JSON.stringify({ type: 'result', result })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) : Response.json(result)
}
function Fixture() {
  const [open, setOpen] = useState(true)
  return <div className="app app-desk"><main className="main" style={{ margin: 0 }}><div className="main-body">{open ? <ApplicationStudio planId={plan?.id} model={{ configured: true, model: 'Synthetic UI fixture' }} onSaved={() => {}} onClose={() => setOpen(false)} /> : <><p>Closed. {published ? 'Fixture published.' : 'Nothing published.'}</p><button onClick={() => setOpen(true)}>Reopen saved build</button></>}</div></main></div>
}
const rootRoute = createRootRoute({ component: Fixture })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
