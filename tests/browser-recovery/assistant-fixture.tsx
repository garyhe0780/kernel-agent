import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationAssistant } from '../../src/components/application-assistant'
import '../../src/styles.css'

type Run = { id: string; status: string; nextStep: number; steps: unknown[]; error: { message: string } | null }
let runs: Run[] = JSON.parse(sessionStorage.getItem('assistant-fixture-runs') ?? '[]')
const requests: { key: string; automatic: boolean }[] = []
const submitted = new Map<string, Run>()
let failFirst = true
let report = (_text: string) => {}
window.fetch = async (url, init) => {
  const path = String(url)
  if (path.includes('operationHealth=')) return Response.json({ status: 'healthy', lastSuccessAt: new Date().toISOString(), stalled: 0 })
  if (path.includes('operationRuns=')) return Response.json(runs)
  if (path.includes('agents=')) return Response.json([{ id: 'fixture-credential', name: 'Synthetic CRM agent', expiresAt: '2099-01-01', revokedAt: null, actions: [{ execution: 'automatic' }] }])
  if (path !== '/api/kernel' || !init?.body) throw new Error('Fixture blocks all other requests')
  const command = JSON.parse(String(init.body))
  if (command.type === 'operate') {
    requests.push({ key: command.idempotencyKey, automatic: command.allowAutomatic })
    report(JSON.stringify({ requests, sameRetryKey: requests.length < 2 ? null : requests[0].key === requests[1].key }))
    if (failFirst) { failFirst = false; return Response.json({ error: 'Synthetic provider interruption. Retry the same task.' }, { status: 502 }) }
    if (!submitted.has(command.idempotencyKey)) {
      const run: Run = { id: `fixture-run-${String(runs.length + 1).padStart(4, '0')}`, status: 'waiting', nextStep: 0, steps: [{}, {}, {}], error: null }
      submitted.set(command.idempotencyKey, run); runs = [run, ...runs]
    }
  } else if (command.type === 'manage_run') {
    runs = runs.map(run => run.id !== command.runId ? run : command.command === 'cancel' ? { ...run, status: 'cancelled' } : command.command === 'retry' ? { ...run, status: 'queued', error: null } : { ...run, status: 'completed', nextStep: 3 })
  } else throw new Error('Unexpected fixture command')
  sessionStorage.setItem('assistant-fixture-runs', JSON.stringify(runs))
  return Response.json(command.type === 'operate' ? { explanation: 'Synthetic reviewed creation and workflow.', run: submitted.get(command.idempotencyKey), status: submitted.get(command.idempotencyKey)!.status } : runs[0])
}
function Fixture() {
  const [trace, setTrace] = useState('No submissions yet.')
  const [mobile, setMobile] = useState(false)
  report = setTrace
  return <main style={{ margin: '24px auto', width: mobile ? '350px' : 'min(900px, 95vw)', maxWidth: '95vw' }}>
    <h1>Assistant recovery acceptance</h1><p>Actual component, synthetic transport. No live API, credentials or database.</p>
    <button onClick={() => setMobile(v => !v)}>Toggle narrow layout</button>
    <ApplicationAssistant project="fixture-crm" owner configured onClose={() => {}} onChange={async () => {}} />
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} aria-label="Request evidence">{trace}</pre>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
