import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleSelection, selectionForModules, validateAssembly } from '../src/kernel/assembly'
import { assemblePattern, compileAssembly, linearAssembly, paymentsAssembly, purchasingAssembly, purchasingExample, salesAssembly, supportAssembly } from '../src/kernel/application'
import { viewAggregates } from '../src/kernel/aggregates'
import { blockCatalog, composeSurface } from '../src/kernel/blocks'
import { grammarCatalog } from '../src/kernel/grammars'
import { catalogSnapshot } from '../src/kernel/modules'
import { patternCatalog } from '../src/kernel/patterns'
import { evaluate } from '../src/kernel/definition'

test('purchasing assembly compiles to a linked purchasing application', () => {
  const app = compileAssembly(purchasingAssembly())
  assert.deepEqual(app.entities.map(entity => entity.slug), ['requests', 'suppliers'])
  assert.equal(app.entities[0].entity.fields.supplier?.reference, 'suppliers')
  assert.equal(app.entities[0].actions.some(action => action.name === 'approve'), true)
  assert.equal(app.entities[1].actions[0].name, 'archive')
  assert.equal(app.startView, 'awaiting_decision')
  assert.equal(app.views[0].entity, 'requests')
  assert.equal(app.layouts[0].entity, 'requests')
})

test('purchasing example is compiled from the kernel assembly', () => {
  assert.deepEqual(purchasingExample(), compileAssembly(purchasingAssembly()))
})

test('sales opportunity assembly compiles to a linked sales application', () => {
  const app = compileAssembly(salesAssembly())
  assert.deepEqual(app.entities.map(entity => entity.slug), ['opportunities', 'customers'])
  assert.equal(app.entities[0].entity.fields.customer?.reference, 'customers')
  assert.equal(app.entities[0].actions.some(action => action.name === 'convert'), true)
  assert.equal(app.startView, 'overview')
  assert.equal(app.views[0].entity, 'opportunities')
  assert.equal(app.views[0].grammar, 'overview')
  assert.equal(app.views[1].grammar, 'board')
  assert.equal(app.layouts[0].entity, 'opportunities')
})

test('a catalog selection auto-links ports and compiles default aliases', () => {
  const assembly = assembleSelection({
    name: 'Team purchasing',
    description: 'Manage suppliers and purchase requests.',
    modules: [{ use: 'purchasing.request' }, { use: 'directory.party' }],
  })
  assert.deepEqual(assembly.modules.map(item => item.as), ['requests', 'parties'])
  assert.deepEqual(assembly.links, [{ from: 'requests.supplier', to: 'parties' }])
  assert.equal(assembly.startView, 'awaiting_decision')
  assert.equal(compileAssembly(assembly).entities[0].entity.fields.supplier?.reference, 'parties')
  assert.throws(() => assembleSelection({ name: 'Requests only', description: 'Missing the directory module.', modules: [{ use: 'purchasing.request' }] }), /must be linked/)
})

test('a sales catalog selection auto-links the customer port', () => {
  const assembly = assembleSelection({
    name: 'Team sales',
    description: 'Track customers and opportunities.',
    modules: [{ use: 'sales.opportunity' }, { use: 'directory.party' }],
  })
  assert.deepEqual(assembly.modules.map(item => item.as), ['opportunities', 'parties'])
  assert.deepEqual(assembly.links, [{ from: 'opportunities.customer', to: 'parties' }])
  assert.equal(assembly.startView, 'overview')
  assert.equal(compileAssembly(assembly).entities[0].entity.fields.customer?.reference, 'parties')
})

test('generic blocks bind to views or records and do not carry business meaning', () => {
  const catalog = blockCatalog()
  assert.deepEqual(catalog.filter(block => block.wired).map(block => block.id), ['filters', 'table', 'details', 'board', 'stats', 'chart'])
  assert.deepEqual(catalog.filter(block => !block.wired).map(block => block.id), ['chat', 'email.compose', 'email.inbox'])
  assert.equal(catalog.every(block => !block.id.includes('purchasing') && !block.id.includes('sales') && !block.id.includes('work')), true)
  assert.deepEqual(composeSurface('ledger').map(block => block.id), ['filters', 'table'])
  assert.deepEqual(composeSurface('board').map(block => block.id), ['filters', 'board'])
  assert.deepEqual(composeSurface('overview').map(block => block.id), ['stats', 'chart'])
  assert.deepEqual(composeSurface('directory').map(block => block.id), ['filters', 'table'])
  assert.deepEqual(composeSurface('detail').map(block => block.id), ['details'])
  assert.equal(composeSurface('ledger').every(block => block.binding === 'view'), true)
  assert.equal(composeSurface('detail')[0].binding, 'record')
})

test('one catalog namespace lists grammars and patterns', () => {
  assert.deepEqual(grammarCatalog().map(item => item.id), ['overview', 'board', 'ledger', 'directory', 'detail'])
  assert.deepEqual(patternCatalog().map(item => item.id), ['purchasing', 'crm', 'issues', 'payments', 'support'])
  assert.equal(patternCatalog().find(item => item.id === 'purchasing')?.homeGrammar, 'ledger')
  assert.equal(patternCatalog().find(item => item.id === 'crm')?.homeGrammar, 'overview')
  assert.equal(patternCatalog().find(item => item.id === 'issues')?.homeGrammar, 'board')
  assert.equal(patternCatalog().find(item => item.id === 'payments')?.homeGrammar, 'ledger')
  assert.equal(patternCatalog().find(item => item.id === 'support')?.homeGrammar, 'board')
  assert.deepEqual(patternCatalog().map(item => [item.id, item.shell]), [['purchasing', 'ledger'], ['crm', 'dashboard'], ['issues', 'tracker'], ['payments', 'ledger'], ['support', 'inbox']])
  assert.equal(assemblePattern('purchasing').pattern, 'purchasing')
  assert.deepEqual(assemblePattern('crm'), salesAssembly())
  assert.deepEqual(assemblePattern('issues'), linearAssembly())
  assert.deepEqual(assemblePattern('payments'), paymentsAssembly())
  assert.deepEqual(assemblePattern('support'), supportAssembly())
  assert.throws(() => assemblePattern('hospitality'), /Unknown pattern/)
  assert.throws(() => composeSurface('calendar' as 'board'), /Unknown grammar/)
})

test('overview aggregates count, status, integer sums and createdAt trend', () => {
  const now = Date.parse('2026-09-21T12:00:00Z')
  const fields = {
    status: { label: 'Status', type: 'enum' as const, options: ['draft', 'submitted', 'approved'], default: 'draft', editable: false, required: true },
    amountCents: { label: 'Amount', type: 'integer' as const, required: true, editable: true },
  }
  const result = viewAggregates([
    { createdAt: '2026-09-20T00:00:00Z', data: { status: 'submitted', amountCents: 100 } },
    { createdAt: '2026-09-10T00:00:00Z', data: { status: 'approved', amountCents: 50 } },
    { createdAt: '2026-08-01T00:00:00Z', data: { status: 'submitted', amountCents: 25 } },
  ], fields, now)
  assert.equal(result.count, 3)
  assert.deepEqual(result.status.map(item => `${item.value}:${item.count}`), ['draft:0', 'submitted:2', 'approved:1'])
  assert.equal(result.sums[0].total, 175)
  assert.equal(result.trend.thisWeek, 1)
  assert.equal(result.trend.priorWeek, 1)
})

test('catalog snapshot names actions and the surfaces each module projects', () => {
  const sales = catalogSnapshot().find(item => item.id === 'sales.opportunity')
  assert.ok(sales)
  assert.equal(sales.actions.some(action => action.name === 'convert'), true)
  assert.deepEqual(sales.surfaces.map(surface => `${surface.grammar}:${surface.name}`), ['overview:Pipeline overview', 'board:Opportunity board', 'detail:Opportunity details'])
  assert.deepEqual(sales.surfaces[0].blocks, ['stats', 'chart'])
  assert.deepEqual(sales.surfaces[1].blocks, ['filters', 'board'])
  assert.deepEqual(sales.surfaces[2].blocks, ['details'])
  const party = catalogSnapshot().find(item => item.id === 'directory.party')
  assert.ok(party)
  assert.deepEqual(party.surfaces.map(surface => `${surface.grammar}:${surface.name}`), ['directory:Active'])
  assert.deepEqual(party.surfaces[0].blocks, ['filters', 'table'])
})

test('selecting a module for a new application also takes required port targets', () => {
  const selection = selectionForModules(['sales.opportunity'])
  assert.deepEqual(selection.modules.map(item => item.use), ['sales.opportunity', 'directory.party'])
  assert.equal(assembleSelection(selection).links[0].from, 'opportunities.customer')
})

test('assembly rejects unknown modules, unlinked ports and unknown settings', () => {
  const base = purchasingAssembly()
  assert.throws(() => compileAssembly({ ...base, modules: [...base.modules, { use: 'invented.widget', as: 'widgets' }] }), /Unknown module/)
  assert.throws(() => compileAssembly({ ...base, links: [] }), /must be linked/)
  assert.throws(() => compileAssembly({ ...base, links: [{ from: 'requests.supplier', to: 'requests' }] }), /directory.party/)
  assert.throws(() => compileAssembly({
    ...base,
    modules: [{ ...base.modules[0], settings: { approvalLimitCents: 1, requireVerifiedSupplier: true, invented: true } }, base.modules[1]],
  }), /Unknown setting/)
})

test('linear assembly compiles issues, required projects and optional people', () => {
  const app = compileAssembly(linearAssembly())
  assert.deepEqual(app.entities.map(entity => entity.slug), ['issues', 'projects', 'people'])
  assert.equal(app.entities[0].entity.fields.project?.reference, 'projects')
  assert.equal(app.entities[0].entity.fields.project?.required, true)
  assert.equal(app.entities[0].entity.fields.assignee?.reference, 'people')
  assert.equal(app.entities[0].entity.fields.assignee?.required, false)
  assert.equal(app.entities[0].actions.some(action => action.name === 'start'), true)
  assert.equal(app.startView, 'board')
  assert.equal(app.views[0].id, 'board')
  assert.equal(app.views[0].grammar, 'board')
  assert.equal(app.layouts[0].entity, 'issues')
  const started = evaluate(app.entities[0], 'start', { title: 'Ship board', description: '', priority: 'high', status: 'backlog', project: 'project-1' }, {}, 'owner')
  assert.equal(started.allowed, true)
  assert.equal(started.after.status, 'started')
  const complete = evaluate(app.entities[0], 'complete', started.after, {}, 'owner')
  assert.equal(complete.after.status, 'done')
  const canceled = evaluate(app.entities[0], 'cancel', started.after, {}, 'owner')
  assert.equal(canceled.after.status, 'canceled')
  assert.equal(evaluate(app.entities[0], 'cancel', { title: 'Ship board', description: '', priority: 'none', status: 'backlog', project: 'project-1' }, {}, 'owner').allowed, false)
})

test('issue assignee port can stay unlinked when people are omitted', () => {
  const assembly = assembleSelection({
    name: 'Project issues',
    description: 'Track issues inside projects without a people directory.',
    modules: [{ use: 'work.issue' }, { use: 'work.project' }],
  })
  assert.deepEqual(assembly.modules.map(item => item.use), ['work.issue', 'work.project'])
  assert.deepEqual(assembly.links, [{ from: 'issues.project', to: 'projects' }])
  const app = compileAssembly(assembly)
  assert.equal(app.entities[0].entity.fields.project?.required, true)
  assert.equal(app.entities[0].entity.fields.assignee, undefined)
  assert.equal(app.views[0].columns.includes('assignee'), false)
  assert.equal(app.layouts[0].sections[0].fields.includes('assignee'), false)
  assert.throws(() => assembleSelection({ name: 'Issues only', description: 'Missing the required project module.', modules: [{ use: 'work.issue' }] }), /must be linked/)
})

test('selecting issues takes the required project module and not people', () => {
  const selection = selectionForModules(['work.issue'])
  assert.deepEqual(selection.modules.map(item => item.use), ['work.issue', 'work.project'])
  const withPeople = assembleSelection({
    name: 'Team issues',
    description: 'Issues, projects and people.',
    modules: [...selection.modules, { use: 'directory.party' }],
  })
  assert.deepEqual(withPeople.links, [{ from: 'issues.project', to: 'projects' }, { from: 'issues.assignee', to: 'parties' }])
  assert.equal(compileAssembly(withPeople).entities[0].entity.fields.assignee?.required, false)
})

test('issue catalog snapshot names optional assignee and board surfaces', () => {
  const issue = catalogSnapshot().find(item => item.id === 'work.issue')
  assert.ok(issue)
  assert.equal(issue.ports.find(port => port.field === 'project')?.required, true)
  assert.equal(issue.ports.find(port => port.field === 'assignee')?.required, false)
  assert.deepEqual(issue.surfaces[0].blocks, ['filters', 'board'])
  assert.equal(issue.surfaces.some(surface => surface.grammar === 'board' && surface.name === 'Issue board'), true)
  const project = catalogSnapshot().find(item => item.id === 'work.project')
  assert.ok(project)
  assert.equal(project.surfaces[0].grammar, 'ledger')
})

test('legacy queue surfaces compile as ledger or board grammars', () => {
  const assembly = validateAssembly({
    name: 'Team purchasing',
    description: 'Manage suppliers and purchase requests.',
    modules: purchasingAssembly().modules,
    links: purchasingAssembly().links,
    surfaces: [
      { kind: 'queue', of: 'requests', view: 'awaiting_decision', label: 'Purchase requests' },
      { kind: 'directory', of: 'suppliers', view: 'active', label: 'Suppliers', name: 'Active suppliers' },
      { kind: 'detail', of: 'requests' },
    ],
    startView: 'awaiting_decision',
  })
  assert.equal(assembly.surfaces[0].grammar, 'ledger')
  assert.equal(assembly.surfaces[1].grammar, 'directory')
  assert.equal(compileAssembly(assembly).startView, 'awaiting_decision')
})

test('payments assembly compiles a ledger of unsigned movements with a required counterparty', () => {
  const app = compileAssembly(paymentsAssembly())
  assert.deepEqual(app.entities.map(entity => entity.slug), ['movements', 'counterparties'])
  assert.equal(app.entities[0].entity.fields.counterparty?.reference, 'counterparties')
  assert.equal(app.entities[0].entity.fields.counterparty?.required, true)
  assert.equal(app.entities[0].entity.fields.amountCents?.type, 'integer')
  assert.deepEqual(app.entities[0].entity.fields.direction?.options, ['inbound', 'outbound'])
  assert.equal(app.entities[0].actions.some(action => action.name === 'approve'), false)
  assert.equal(Object.keys(app.entities[0].settings).length, 0)
  assert.equal(app.entities[0].actions.some(action => action.name === 'post'), true)
  assert.equal(app.entities[0].actions.some(action => action.name === 'fail'), true)
  assert.equal(app.startView, 'ledger')
  assert.equal(app.views[0].id, 'ledger')
  assert.equal(app.views[0].grammar, 'ledger')
  assert.equal(app.views[1].grammar, 'overview')
  const posted = evaluate(app.entities[0], 'post', { title: 'Inbound rent', amountCents: 12000, direction: 'inbound', note: '', status: 'draft', counterparty: 'party-1' }, {}, 'owner')
  assert.equal(posted.allowed, true)
  assert.equal(posted.after.status, 'posted')
  const failed = evaluate(app.entities[0], 'fail', { title: 'Inbound rent', amountCents: 12000, direction: 'inbound', note: '', status: 'draft', counterparty: 'party-1' }, {}, 'owner')
  assert.equal(failed.after.status, 'failed')
  assert.equal(evaluate(app.entities[0], 'post', posted.after, {}, 'owner').allowed, false)
})

test('a payments catalog selection auto-links the counterparty port', () => {
  const assembly = assembleSelection({
    name: 'Team payments',
    description: 'Record inbound and outbound movements.',
    modules: [{ use: 'finance.movement' }, { use: 'directory.party' }],
  })
  assert.deepEqual(assembly.modules.map(item => item.as), ['movements', 'parties'])
  assert.deepEqual(assembly.links, [{ from: 'movements.counterparty', to: 'parties' }])
  assert.equal(assembly.startView, 'ledger')
  assert.throws(() => assembleSelection({ name: 'Movements only', description: 'Missing the directory module.', modules: [{ use: 'finance.movement' }] }), /must be linked/)
})

test('support assembly compiles a requester board without a project', () => {
  const app = compileAssembly(supportAssembly())
  assert.deepEqual(app.entities.map(entity => entity.slug), ['tickets', 'requesters'])
  assert.equal(app.entities[0].entity.fields.requester?.reference, 'requesters')
  assert.equal(app.entities[0].entity.fields.requester?.required, true)
  assert.equal(app.entities[0].entity.fields.project, undefined)
  assert.deepEqual(app.entities[0].entity.fields.status?.options, ['open', 'waiting', 'resolved'])
  assert.equal(app.startView, 'board')
  assert.equal(app.views[0].id, 'board')
  assert.equal(app.views[0].grammar, 'board')
  assert.equal(app.views.some(view => view.grammar === 'overview'), false)
  const waiting = evaluate(app.entities[0], 'wait', { title: 'Login help', description: '', status: 'open', requester: 'party-1' }, {}, 'owner')
  assert.equal(waiting.after.status, 'waiting')
  const resolved = evaluate(app.entities[0], 'resolve', { title: 'Login help', description: '', status: 'open', requester: 'party-1' }, {}, 'owner')
  assert.equal(resolved.after.status, 'resolved')
  assert.equal(evaluate(app.entities[0], 'resume', waiting.after, {}, 'owner').after.status, 'open')
  assert.equal(evaluate(app.entities[0], 'reopen', resolved.after, {}, 'owner').after.status, 'open')
  assert.equal(evaluate(app.entities[0], 'resolve', waiting.after, {}, 'owner').allowed, false)
})

test('selecting payments or support takes the required directory module', () => {
  assert.deepEqual(selectionForModules(['finance.movement']).modules.map(item => item.use), ['finance.movement', 'directory.party'])
  assert.deepEqual(selectionForModules(['support.ticket']).modules.map(item => item.use), ['support.ticket', 'directory.party'])
})

test('movement and ticket catalog snapshots name ledger and board surfaces', () => {
  const movement = catalogSnapshot().find(item => item.id === 'finance.movement')
  assert.ok(movement)
  assert.equal(movement.ports.find(port => port.field === 'counterparty')?.required, true)
  assert.deepEqual(movement.surfaces.map(surface => `${surface.grammar}:${surface.name}`), ['ledger:Movements', 'overview:Movement overview', 'detail:Movement details'])
  assert.deepEqual(movement.surfaces[0].blocks, ['filters', 'table'])
  const ticket = catalogSnapshot().find(item => item.id === 'support.ticket')
  assert.ok(ticket)
  assert.equal(ticket.ports.find(port => port.field === 'requester')?.required, true)
  assert.equal(ticket.ports.some(port => port.field === 'project'), false)
  assert.deepEqual(ticket.surfaces.map(surface => `${surface.grammar}:${surface.name}`), ['board:Ticket board', 'detail:Ticket details'])
  assert.deepEqual(ticket.surfaces[0].blocks, ['filters', 'board'])
})
