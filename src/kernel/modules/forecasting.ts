import { kernelModuleSchema, type KernelModule } from '../module-contract'
import { date } from './fields'
import { memberOwnershipModules } from './member-ownership'

type Rule = KernelModule['definition']['actions'][number]['policies'][number]
const present = (id: string, label: string, field: string): Rule => ({ id, label, field, operator: 'present', value: true })
const positive = (id: string, label: string, field: string): Rule => ({ id, label, field, operator: 'gte', value: 1 })
const contact = present('needs_contact', 'Primary contact is chosen', 'contactPerson')
const closeDate = present('needs_close_date', 'Expected close date is set', 'closeDate')
const value = positive('needs_value', 'Deal value is entered', 'amountCents')
const stageRules: Record<string, Rule[]> = {
  advance_new: [contact, present('needs_next_step', 'Next step is written', 'nextStep')],
  advance_qualified: [present('needs_owner', 'Deal has an owner', 'assignee')],
  advance_discovery: [value, closeDate],
  advance_proposal: [contact, closeDate],
  advance_negotiation: [value],
}
const stageProbability: Record<string, number> = { qualified: 20, discovery: 40, proposal: 60, negotiation: 80, won: 100, lost: 0 }
const closedOnInput = { label: 'Closed on', type: 'string' as const, format: 'date' as const, required: true, editable: true, min: 10, max: 10 }
const choice = (label: string, options: string[]) => ({ label, type: 'enum' as const, options, required: true, editable: true })
export const winReasons = ['Product fit', 'Price', 'Relationship', 'Timing', 'Other']
export const lossReasons = ['Price', 'Competitor', 'No decision', 'Timing', 'Product fit', 'Other']

const release = <T extends KernelModule>(source: T) => {
  const next = kernelModuleSchema.parse(structuredClone(source))
  next.version = 5
  return next
}
const [dealV4, taskV4, activityV4] = memberOwnershipModules

const deal = release(dealV4)
Object.assign(deal.definition.entity.fields, {
  probability: { label: 'Win probability', type: 'integer', format: 'percent', min: 0, max: 100, default: 10 },
  forecastCategory: { label: 'Forecast category', type: 'enum', options: ['Pipeline', 'Best case', 'Commit', 'Omitted'], default: 'Pipeline' },
  winReason: { label: 'Win reason', type: 'enum', options: winReasons, required: false, editable: false },
  lossCategory: { label: 'Loss reason', type: 'enum', options: lossReasons, required: false, editable: false },
  closedOn: { ...date('Closed on'), editable: false },
})
deal.definition.entity.fields.lossReason.label = 'Loss details'
deal.definition.actions = deal.definition.actions.map((action): KernelModule['definition']['actions'][number] => {
  const target = String(action.effects.status)
  const next = { ...action, policies: [...action.policies, ...(stageRules[action.name] ?? [])], effects: { ...action.effects, probability: stageProbability[target] ?? stageProbability.qualified } }
  if (target === 'won') return { ...next, input: { winReason: choice('Win reason', winReasons), closedOn: closedOnInput }, effects: { ...next.effects, winReason: '$input.winReason', closedOn: '$input.closedOn' } }
  if (target === 'lost') return { ...next, input: { category: choice('Loss reason', lossReasons), reason: { ...action.input.reason!, label: 'Loss details' }, closedOn: closedOnInput }, effects: { ...next.effects, lossCategory: '$input.category', closedOn: '$input.closedOn' } }
  if (action.name === 'reopen_lost') return { ...next, effects: { ...next.effects, closedOn: '' } }
  return next
})
deal.layout = { sections: [
  ...deal.layout!.sections.filter(section => section.id !== 'outcome').map(section => section.id === 'commercial' ? { ...section, fields: ['amountCents', 'probability', 'forecastCategory', 'closeDate', 'closedOn'] } : section),
  { id: 'won', name: 'Won deal', fields: ['winReason'], when: { field: 'status', operator: 'eq', value: 'won' } },
  { id: 'outcome', name: 'Lost deal', fields: ['lossCategory', 'lossReason'], when: { field: 'status', operator: 'eq', value: 'lost' } },
] }
deal.views = [
  ...deal.views.map(view => view.id === 'pipeline' ? { ...view, columns: view.columns.filter(key => key !== 'status').flatMap(key => key === 'amountCents' ? [key, 'probability'] : [key]) } : view),
  { id: 'forecast', name: 'Closing in 90 days', grammar: 'ledger', timeZone: 'UTC', columns: ['title', 'customer', 'assignee', 'amountCents', 'probability', 'forecastCategory', 'closeDate'], filters: [{ field: 'status', operator: 'neq', value: 'won' }, { field: 'status', operator: 'neq', value: 'lost' }, { field: 'closeDate', operator: 'date_before', value: 90 }], sort: { field: 'closeDate', direction: 'asc' } },
]

const linkedToAccounts = <T extends KernelModule>(source: T) => {
  const next = release(source)
  next.ports = [
    ...next.ports.map(port => port.target === 'sales.deal' ? { ...port, targetVersion: 5, required: false } : port),
    { field: 'account', target: 'directory.account', targetVersion: 1, label: 'Account', required: false },
    { field: 'contact', target: 'directory.contact', targetVersion: 1, label: 'Contact', required: false, referenceMatch: { sourceField: 'account', targetField: 'account' } },
  ]
  next.views = next.views.map(view => ({ ...view, columns: view.columns.flatMap(key => key === 'deal' ? [key, 'account'] : [key]) }))
  return next
}
export const forecastingModules = [deal, linkedToAccounts(taskV4), linkedToAccounts(activityV4)]
