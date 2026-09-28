import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationAssistant } from '../../src/components/application-assistant'
import '../../src/styles.css'
const steps = [{ operation: 'create', capability: 'synthetic_crm__opportunities', input: { title: 'Synthetic opportunity' }, execution: 'automatic' }, { operation: 'action', capability: 'synthetic_crm__opportunities', input: {}, action: 'open', execution: 'review', record: { step: 0 } }]
const runs = [{ id: 'synthetic-cancelled-run', status: 'cancelled', nextStep: 1, steps, error: null,
  inspection: steps.map((step, index) => ({ ...step, index, status: index ? 'cancelled' : 'applied', recordId: 'synthetic-record', proposal: { id: `proposal-${index}`, status: index ? 'rejected' : 'applied', input: step.input, before: index ? { status: 'new' } : {}, after: { title: 'Synthetic opportunity', status: index ? 'open' : 'new' }, checks: [], reviewedBy: null } })),
  history: [{ id: 'event-1', action: 'run.cancel', outcome: 'cancelled', actorName: 'Synthetic owner', createdAt: '2026-09-28T00:00:00Z' }] },
  { id: 'synthetic-rejected-run', status: 'failed', nextStep: 0, steps, inspection: [], history: [], error: { code: 'PROPOSAL_REJECTED', message: 'Proposal rejected by reviewer.' } }]
window.fetch = async url => {
  if (String(url).includes('operationHealth=')) return Response.json({ status: 'unavailable', lastSuccessAt: null, stalled: 0 })
  if (String(url).includes('operationRuns=')) return Response.json(runs)
  if (String(url).includes('agents=')) return Response.json([])
  throw new Error('Synthetic fixture blocks all other requests')
}
function Fixture() {
  const [opened, setOpened] = useState('')
  return <main style={{ maxWidth: 560, margin: '24px auto', padding: 16 }}><h1>Run inspection</h1><p>Synthetic UI fixture</p><ApplicationAssistant project="synthetic" owner configured onClose={() => {}} onChange={async () => {}} onOpenRecord={(cap, id) => setOpened(`${cap}: ${id}`)} /><p role="status">{opened}</p></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
