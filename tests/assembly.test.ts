import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleSelection, selectionForModules } from '../src/kernel/assembly'
import { compileAssembly, linearAssembly, purchasingAssembly, purchasingExample, salesAssembly } from '../src/kernel/application'
import { blockCatalog, composeSurface } from '../src/kernel/blocks'
import { catalogSnapshot } from '../src/kernel/modules'
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
  assert.equal(app.startView, 'open')
  assert.equal(app.views[0].entity, 'opportunities')
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
  assert.equal(assembly.startView, 'open')
  assert.equal(compileAssembly(assembly).entities[0].entity.fields.customer?.reference, 'parties')
})

test('generic blocks bind to views or records and do not carry business meaning', () => {
  const catalog = blockCatalog()
  assert.deepEqual(catalog.filter(block => block.wired).map(block => block.id), ['filters', 'table', 'details', 'board'])
  assert.deepEqual(catalog.filter(block => !block.wired).map(block => block.id), ['chart', 'chat', 'email.compose', 'email.inbox'])
  assert.equal(catalog.every(block => !block.id.includes('purchasing') && !block.id.includes('sales') && !block.id.includes('work')), true)
  assert.deepEqual(composeSurface('queue').map(block => block.id), ['filters', 'table', 'board'])
  assert.deepEqual(composeSurface('directory').map(block => block.id), ['filters', 'table'])
  assert.deepEqual(composeSurface('detail').map(block => block.id), ['details'])
  assert.equal(composeSurface('queue').every(block => block.binding === 'view'), true)
  assert.equal(composeSurface('detail')[0].binding, 'record')
})

test('catalog snapshot names actions and the surfaces each module projects', () => {
  const sales = catalogSnapshot().find(item => item.id === 'sales.opportunity')
  assert.ok(sales)
  assert.equal(sales.actions.some(action => action.name === 'convert'), true)
  assert.deepEqual(sales.surfaces.map(surface => `${surface.kind}:${surface.name}`), ['queue:Open pipeline', 'detail:Opportunity details'])
  assert.deepEqual(sales.surfaces[0].blocks, ['filters', 'table', 'board'])
  assert.deepEqual(sales.surfaces[1].blocks, ['details'])
  const party = catalogSnapshot().find(item => item.id === 'directory.party')
  assert.ok(party)
  assert.deepEqual(party.surfaces.map(surface => `${surface.kind}:${surface.name}`), ['directory:Active'])
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
  assert.deepEqual(issue.surfaces[0].blocks, ['filters', 'table', 'board'])
  assert.equal(issue.surfaces.some(surface => surface.kind === 'queue' && surface.name === 'Issue board'), true)
  const project = catalogSnapshot().find(item => item.id === 'work.project')
  assert.ok(project)
  assert.equal(project.surfaces[0].kind, 'queue')
})
