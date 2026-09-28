import { useEffect, useRef, useState } from 'react'
import { runRecovery } from '@/kernel/agent-runs'
import type { InspectedRun } from '@/kernel/run-inspection.server'
import { X } from 'lucide-react'
import { request } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, Badge, Spinner } from '@/components/ui/surfaces'

type Grant = { id: string; name: string; revokedAt: string | null; expiresAt: string; actions: { execution?: string }[] }
type Run = { stalled?: boolean; deadlineAt?: string; id: string; status: string; nextStep: number; steps: unknown[]; error: { message?: string } | null; inspection?: InspectedRun['inspection']; history?: { id: string; action: string; actorName: string; outcome: string; createdAt: string }[] }

export function ApplicationAssistant({ project, owner, configured, onClose, onChange, onOpenRecord }: {
  project: string; owner: boolean; configured: boolean; onClose: () => void; onChange: () => Promise<unknown>; onOpenRecord?: (capability: string, recordId: string) => void
}) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [credentialId, setCredentialId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [automatic, setAutomatic] = useState('review')
  const [runs, setRuns] = useState<Run[]>([])
  const [health, setHealth] = useState<{ status: string; lastSuccessAt: string | null; stalled: number } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const keys = useRef(new Map<string, string>())
  async function refresh() {
    setRuns(await request<Run[]>(`/api/kernel?operationRuns=${encodeURIComponent(project)}`))
  }
  useEffect(() => {
    if (!owner) return
    let active = true
    const load = async () => {
      try {
        const [credentials, latest, worker] = await Promise.all([
          request<Grant[]>(`/api/kernel?agents=${encodeURIComponent(project)}`),
          request<Run[]>(`/api/kernel?operationRuns=${encodeURIComponent(project)}`),
          request<{ status: string; lastSuccessAt: string | null; stalled: number }>('/api/kernel?operationHealth=1'),
        ])
        if (active) { setGrants(credentials.filter(g => !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now())); setRuns(latest); setHealth(worker) }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load agent access.') }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => { active = false; clearInterval(timer) }
  }, [project, owner])
  async function work(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action(); await refresh(); await onChange() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The request failed.') }
    finally { setBusy(false) }
  }
  const selected = grants.find(g => g.id === credentialId)
  const canAuto = selected?.actions.some(a => a.execution === 'automatic')
  return <section className="desk-assistant">
    <header><h2>Application assistant</h2><Button variant="ghost" size="icon" aria-label="Close assistant" onPress={onClose}><X /></Button></header>
    {!owner ? <p>A workspace owner can run the assistant with a scoped application credential.</p> : <>
      <p className="muted">Choose agent access, then describe a task. The assistant can find records and plan creation or actions. Review is the default.</p>
      {!configured ? <Alert>The model is not connected. Configure it in workspace settings before submitting a task.</Alert> : null}
      {!grants.length ? <Alert>Create an application credential in Configure → Agents to enable the assistant.</Alert> : null}
      <FieldGroup>
        <Select label="Agent access" value={credentialId} onChange={id => { setCredentialId(id); setAutomatic('review') }} options={[{ value: '', label: 'Choose a credential' }, ...grants.map(g => ({ value: g.id, label: g.name }))]} />
        {canAuto ? <Select label="Execution" value={automatic} onChange={setAutomatic} options={[{ value: 'review', label: 'Require human review' }, { value: 'automatic', label: 'Allow granted automatic operations' }]} /> : null}
        {automatic === 'automatic' && canAuto ? <Alert variant="warning">The run may apply explicitly granted operations without review. Other operations still require approval.</Alert> : null}
        <Field value={instruction} onChange={setInstruction} isDisabled={busy}><FieldLabel>Task</FieldLabel><Input placeholder="Find the customer and create an opportunity…" /></Field>
      </FieldGroup>
      <Button variant="outline" disabled={!configured || !selected || busy || instruction.trim().length < 5} onPress={() => void work(async () => {
        const identity = JSON.stringify({ credentialId, instruction, automatic })
        const idempotencyKey = keys.current.get(identity) ?? crypto.randomUUID()
        keys.current.set(identity, idempotencyKey)
        const result = await request<{ explanation: string; run: Run | null }>('/api/kernel', { type: 'operate', project, credentialId, instruction, allowAutomatic: automatic === 'automatic' && Boolean(canAuto), idempotencyKey })
        setExplanation(result.run ? `Run saved. ${result.explanation}` : result.explanation)
        // Preserve the key until the user changes the task, including after success.
      })}>{busy ? <Spinner data-icon="inline-start" /> : null}Plan task</Button>
      {explanation ? <><Alert>{explanation}</Alert><Button variant="ghost" disabled={busy} onPress={() => { keys.current.clear(); setInstruction(''); setExplanation('') }}>New task</Button></> : null}
      {health ? <p className="muted">{health.status === 'healthy' ? 'Run worker connected.' : health.status === 'degraded' ? 'The run worker reported a polling error. Check the worker logs.' : 'No recent worker heartbeat. Start the operation worker or use Advance run.'}{health.lastSuccessAt ? ` Last check: ${new Date(health.lastSuccessAt).toLocaleString()}.` : ''}{health.stalled ? ` ${health.stalled} queued runs need attention in this workspace.` : ''}</p> : null}
      {runs.length ? <><h3>Recent runs</h3>{runs.map(run => <div key={run.id}>
        <p><Badge>{run.status}</Badge> {run.nextStep} / {run.steps.length} steps · {run.id.slice(-8)}</p>
        <p className="muted">{runRecovery(run.status, run.error).message}</p>
        {run.stalled ? <Alert variant="warning">This queued run has not been checked for over a minute. Check the worker or advance it manually.</Alert> : null}
        {run.deadlineAt ? <p className="muted">Deadline: {new Date(run.deadlineAt).toLocaleString()}</p> : null}
        {run.status === 'waiting' ? <a href="/inbox">Open review inbox</a> : null}
        <details className="run-inspection"><summary>Inspect steps and history</summary>
          <ol>{run.inspection?.map(step => <li key={step.index}>
            <p><strong>{step.operation === 'create' ? 'Create record' : step.action}</strong> · {step.status}</p>
            <p className="muted">{step.capability} · {step.execution === 'automatic' ? 'Automatic' : 'Human review'}</p>
            {step.recordId && onOpenRecord ? <Button variant="ghost" onPress={() => onOpenRecord(step.capability, step.recordId!)}>Open record</Button> : null}
            {step.proposal?.status === 'pending' ? <a href="/inbox">Review proposal {step.proposal.id.slice(-8)}</a> : null}
            <details><summary>Input and proposed changes</summary>
              <pre>{JSON.stringify(step.proposal ? { input: step.proposal.input, before: step.proposal.before, after: step.proposal.after, checks: step.proposal.checks } : { input: step.input }, null, 2)}</pre>
            </details>
            {step.proposal?.reviewedBy ? <p>Reviewed by {step.proposal.reviewedBy}</p> : null}
          </li>)}</ol>
          {!run.inspection ? <p>Step details are unavailable. Refresh to try again.</p> : null}
          {run.history?.length ? <><h4>History · latest 50 events</h4><ul>{run.history.map(event => <li key={event.id}>{event.action} · {event.outcome} · {event.actorName} · {new Date(event.createdAt).toLocaleString()}</li>)}</ul></> : null}
        </details>
        {run.error?.message ? <Alert variant="warning">{run.error.message}</Alert> : null}
        {['queued', 'waiting', 'failed'].includes(run.status) ? <div className="builder-actions">
          <Button variant="outline" disabled={busy || (run.status === 'failed' && !runRecovery(run.status, run.error).canRetry)} onPress={() => void work(async () => { await request('/api/kernel', { type: 'manage_run', runId: run.id, command: run.status === 'failed' ? 'retry' : 'advance' }) })}>{run.status === 'failed' ? 'Retry run' : 'Advance run'}</Button>
          <Button variant="outline" disabled={busy} onPress={() => void work(async () => { await request('/api/kernel', { type: 'manage_run', runId: run.id, command: 'cancel' }) })}>Cancel run</Button>
        </div> : null}
      </div>)}</> : null}
    </>}
    {error ? <Alert variant="warning">{error}</Alert> : null}
  </section>
}
