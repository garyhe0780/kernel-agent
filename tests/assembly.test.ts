import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleSelection, selectionForModules } from '../src/kernel/assembly'
import { compileAssembly, purchasingAssembly, purchasingExample, salesAssembly } from '../src/kernel/application'
import { blockCatalog, composeSurface } from '../src/kernel/blocks'
import { catalogSnapshot } from '../src/kernel/modules'

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
  assert.deepEqual(catalog.filter(block => block.wired).map(block => block.id), ['filters', 'table', 'details'])
  assert.deepEqual(catalog.filter(block => !block.wired).map(block => block.id), ['chart', 'chat', 'email.compose', 'email.inbox'])
  assert.equal(catalog.every(block => !block.id.includes('purchasing') && !block.id.includes('sales')), true)
  assert.deepEqual(composeSurface('queue').map(block => block.id), ['filters', 'table'])
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
  assert.deepEqual(sales.surfaces[0].blocks, ['filters', 'table'])
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
