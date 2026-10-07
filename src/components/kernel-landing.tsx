import { useState } from 'react'
import { ArrowRight, Check, Braces, Users, Terminal } from 'lucide-react'
import { PublicShell } from './public-shell'
import { ToggleGroup } from './ui/surfaces'
import { WaitlistSignup } from './waitlist-signup'

const examples = {
  crm: { name: 'CRM', entities: 'Customers → Opportunities', record: 'Acme / Expansion', action: 'Open opportunity', before: 'New', after: 'Open', policy: 'Customer reference is valid', code: 'open' },
  issues: { name: 'Project management', entities: 'Projects → Issues', record: 'Website / Fix navigation', action: 'Start issue', before: 'Backlog', after: 'In progress', policy: 'Project reference is valid', code: 'start' },
} as const

export function KernelLanding() {
  const [example, setExample] = useState('crm')
  const [step, setStep] = useState('contract')
  const current = examples[example as keyof typeof examples]
  return <PublicShell>
    <main id="public-main" className="public-landing" tabIndex={-1}>
      <section className="public-hero public-container">
        <div className="public-hero-copy"><h1>The runtime for your whole team{' '}<br /><span>— including agents.</span></h1><p>Define your business once. Give people and agents the interfaces, rules, and workflows to run it together.</p><div className="public-actions"><a className="public-cta" href="/docs/quickstart">Start building <ArrowRight aria-hidden="true" /></a><a className="public-cta public-cta-outline" href="#waitlist">Join the waitlist <ArrowRight aria-hidden="true" /></a><a className="public-text-link" href="#architecture">See how it works <ArrowRight aria-hidden="true" /></a></div><p className="public-hero-note">For developers and agent builders. Under active development.</p></div>
        <div className="runtime-map" role="group" aria-label="People and agents share Kernel's definitions, validation, and records">
          <div className="runtime-inputs"><div><Users aria-hidden="true" /><strong>People</strong><span>Forms · queues · review</span></div><div><Terminal aria-hidden="true" /><strong>Agents</strong><span>MCP · HTTP · assistant</span></div></div>
          <div className="runtime-connections" aria-hidden="true"><span /><span /></div>
          <div className="runtime-core"><div className="runtime-core-heading"><Braces aria-hidden="true" /><strong>Kernel runtime</strong></div><p>One definition. Shared rules.</p><ul><li>Identity &amp; scope</li><li>Policies &amp; validation</li><li>Review &amp; execution</li></ul></div>
          <div className="runtime-connections runtime-connections-out" aria-hidden="true"><span /></div>
          <div className="runtime-output"><span>Versioned records</span><span>Durable runs</span><span>Audit history</span></div>
          <p className="runtime-caption">Models propose work. The runtime decides what can run.</p>
        </div>
      </section>
      <WaitlistSignup />
      <section className="public-architecture public-container" id="architecture">
        <div className="public-section-heading"><h2>The application is the contract.</h2><p>Define the business once. Give people a working interface and agents a structured way to use it.</p></div>
        <div className="public-contract-rows">
          <div><span className="public-sequence">01</span><h3>Define the business</h3><p>Compose versioned modules, or submit a supported custom definition. Entities, relationships, actions, and policies describe how the application works.</p><a href="/docs/build-applications">Application definitions <ArrowRight aria-hidden="true" /></a></div>
          <div><span className="public-sequence">02</span><h3>Publish both interfaces</h3><p>The same definition powers human forms and queues, plus scoped contracts that agents can discover through MCP and HTTP.</p><a href="/docs/connect-agents">Agent contracts <ArrowRight aria-hidden="true" /></a></div>
          <div><span className="public-sequence">03</span><h3>Execute with context</h3><p>Every change passes through authorization, validation, and policy checks. Review is the default. Automatic execution requires an explicit grant.</p><a href="/docs/agent-runs">Execution and review <ArrowRight aria-hidden="true" /></a></div>
        </div>
      </section>
      <section className="public-demo-band" id="applications"><div className="public-container public-demo-layout">
        <div><h2>Different business.<br />Same foundation.</h2><p>CRM and project management are reference applications built on Kernel’s shared primitives. Explore a simplified example of the contract and review flow.</p><ToggleGroup label="Example application" value={example} onChange={value => { setExample(value); setStep('contract') }} options={[{ value: 'crm', label: 'CRM' }, { value: 'issues', label: 'Projects' }]} /><p className="public-demo-disclaimer">Illustrative data. This walkthrough does not create records or run an agent.</p><a className="public-text-link" href="/docs/quickstart">Try a real local workspace <ArrowRight aria-hidden="true" /></a></div>
        <div className="public-demo"><header><div><strong>{current.name}</strong><p>{current.entities}</p></div><span>Example</span></header><ToggleGroup label="Walkthrough stage" value={step} onChange={setStep} options={[{ value: 'contract', label: 'Contract' }, { value: 'proposal', label: 'Proposal' }, { value: 'review', label: 'Review' }]} />
          <div className="public-demo-body" aria-live="polite">
            <div className="public-demo-panel" aria-hidden={step !== 'contract'} inert={step !== 'contract'}><h3>{current.action}</h3><p>A discoverable operation with a defined input and lifecycle transition.</p><pre tabIndex={0} aria-label={`${current.name} example contract`}><code>{JSON.stringify({ action: current.code, input: {}, from: current.before, to: current.after, execution: 'review' }, null, 2)}</code></pre><p className="public-demo-disclaimer">Simplified contract. Discover the exact schema from your application.</p></div>
            <div className="public-demo-panel" aria-hidden={step !== 'proposal'} inert={step !== 'proposal'}><h3>A proposed record change</h3><p>{current.record}</p><dl className="public-change"><div><dt>Current state</dt><dd>{current.before}</dd></div><div><dt>Proposed state</dt><dd>{current.after}</dd></div></dl><p><Check aria-hidden="true" /> {current.policy}</p><p><Check aria-hidden="true" /> Action is within the credential’s scope</p><p>No business data changes until review.</p></div>
            <div className="public-demo-panel" aria-hidden={step !== 'review'} inert={step !== 'review'}><h3>Human review, then execution</h3><p>The reviewer inspects the proposal. On approval, Kernel rechecks the current record, definition, authorization, and policies before applying it.</p><ol><li>Apply the approved change transactionally.</li><li>Record the actor and outcome.</li><li>Resume the run from its saved checkpoint.</li></ol><a className="public-text-link" href="/docs/agent-runs">Understand review and recovery <ArrowRight aria-hidden="true" /></a></div>
          </div>
        </div>
      </div></section>
      <section className="public-container public-boundaries"><div><h2>Autonomy with explicit boundaries.</h2><p>Connect your preferred agent without handing it the keys to everything.</p><a className="public-text-link" href="/docs/current-scope">Read what’s supported today <ArrowRight aria-hidden="true" /></a></div><dl><div><dt>Scoped access</dt><dd>Separate builder and operator credentials. Expiry, revocation, and version-pinned operations.</dd></div><div><dt>Durable progress</dt><dd>Bounded runs with checkpoints, review pauses, cancellation, and attributable history.</dd></div><div><dt>Resource limits</dt><dd>Operation quotas, model-call budgets, deadlines, and owner-visible worker health.</dd></div></dl></section>
      <section className="public-container public-closing"><h2>Build your next application<br />on a shared foundation.</h2><div><p>Start with a local workspace, then connect an agent to the same application your team uses.</p><a className="public-cta" href="/docs/quickstart">Read the quickstart <ArrowRight aria-hidden="true" /></a></div></section>
    </main>
  </PublicShell>
}
