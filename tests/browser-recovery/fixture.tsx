import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { ProjectBuilder } from '../../src/components/project-builder'
import { purchasingExample, type Draft } from '../../src/kernel/application'
import '../../src/styles.css'

const initial: Draft = { id: 'recovery-draft', brief: 'Build purchasing for our team.', definition: purchasingExample(), version: 1, status: 'draft', source: 'example', projectSlug: null, baseProjectVersion: null, updatedAt: new Date().toISOString() }
const plan = { summary: 'Confirm the purchase limit.', questions: [{ id: 'limit', question: 'What is the purchase limit?', reason: 'Purchases above this limit are blocked.', suggestedAnswer: 'Allow up to USD 1000.' }] }
let saved: Draft = JSON.parse(sessionStorage.getItem('recovery-saved') || 'null') || initial
let clarifyCalls = 0, buildCalls = 0
const events: string[] = []
function Fixture() {
  const [open, setOpen] = useState(true)
  const [log, setLog] = useState('No requests yet.')
  const send = async <T,>(_url: string, body?: unknown): Promise<T> => {
    const c = body as { type: string; brief: string; definition: Draft['definition'] }
    events.push(c.type); setLog(events.join(' → '))
    await new Promise(resolve => setTimeout(resolve, 300))
    if (c.type === 'clarify') {
      if (++clarifyCalls === 1) throw new Error('Synthetic clarification timeout. Retry the request; your saved draft is unchanged.')
      return plan as T
    }
    if (c.type === 'build') {
      if (++buildCalls === 1) throw new Error('Synthetic generation interruption. Retry the build; your answers remain in the description.')
      saved = { ...saved, brief: c.brief, definition: { ...saved.definition, name: 'Recovered purchasing' }, version: saved.version + 1 }
    } else if (c.type === 'save_draft') saved = { ...saved, brief: c.brief, definition: c.definition, version: saved.version + 1 }
    else throw new Error(`Unexpected ${c.type}: fixture does not publish.`)
    sessionStorage.setItem('recovery-saved', JSON.stringify(saved))
    return saved as T
  }
  return <div className="app app-desk"><main className="main" style={{ margin: 0 }}><header className="main-header"><div><h1>Builder recovery verification</h1><p>Synthetic transport. No live requests or publication.</p></div></header><div className="main-body"><p role="status">Requests: {log}</p>{open ? <ProjectBuilder draft={saved} model={{ configured: true, model: 'Synthetic recovery test' }} send={send} onSaved={() => {}} onClose={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Reopen saved draft</button>}</div></main></div>
}
const rootRoute = createRootRoute({ component: Fixture })
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
