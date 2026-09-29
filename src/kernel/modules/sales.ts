import type { ModuleSource } from '../module-contract'
import { text, date, status, transition, archive, base } from './fields'

import { taskModule, activityModule } from './work'

const dealStages = ['new', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost']
export const dealModule: ModuleSource = {
  ...base, id: 'sales.deal', defaultAlias: 'opportunities', grammar: 'board',
  ports: [{ field: 'customer', target: 'directory.account', label: 'Account' }, { field: 'owner', target: 'directory.person', label: 'Owner', required: false }, { field: 'contactPerson', target: 'directory.contact', label: 'Primary contact', required: false }],
  definition: {
    slug: 'deal', name: 'Deals', description: 'Sales opportunities with ownership, value, next steps and a defined sales lifecycle. Amounts are USD; no currency conversion.',
    entity: { name: 'opportunity', label: 'Deal', fields: {
      title: { label: 'Deal', type: 'string', min: 3, max: 120 }, source: { label: 'Source', type: 'enum', options: ['Inbound', 'Outbound', 'Referral', 'Event'], default: 'Inbound' },
      amountCents: { label: 'Deal value (USD cents)', type: 'integer', min: 0, default: 0 },
      closeDate: date('Expected close date'), nextStep: text('Next step', 500), followUpDate: date('Follow-up date'), notes: text('Deal notes', 4000),
      lossReason: { ...text('Loss reason', 500), editable: false }, status: status(dealStages),
    } }, settings: {}, reviewerRoles: ['owner'],
    actions: [
      ...dealStages.slice(0, 5).map((stage, index) => transition(`advance_${stage}`, ['Qualify deal', 'Start discovery', 'Prepare proposal', 'Start negotiation', 'Mark deal won'][index], stage, dealStages[index + 1])),
      ...dealStages.slice(0, 5).map(stage => ({ ...transition(`lose_${stage}`, 'Mark lost', stage, 'lost'), input: { reason: { label: 'Loss reason', type: 'string' as const, min: 3, max: 500 } }, effects: { status: 'lost', lossReason: '$input.reason' } })),
      transition('reopen_lost', 'Reopen deal', 'lost', 'qualified'),
    ],
  },
  views: [
    { id: 'pipeline', name: 'Sales pipeline', grammar: 'board', columns: ['title', 'customer', 'owner', 'amountCents', 'closeDate', 'nextStep', 'followUpDate', 'status'] },
    { id: 'overview', name: 'Pipeline overview', grammar: 'overview', columns: ['title', 'amountCents', 'status'] },
    { id: 'followups', name: 'Follow-up dates', grammar: 'ledger', columns: ['title', 'owner', 'nextStep', 'followUpDate', 'status'], sort: { field: 'followUpDate', direction: 'asc' } },
  ],
  layout: { sections: [
    { id: 'deal', name: 'Deal', fields: ['title', 'customer', 'contactPerson', 'owner', 'source', 'status'] },
    { id: 'commercial', name: 'Value and timing', fields: ['amountCents', 'closeDate'] },
    { id: 'next', name: 'Next action', fields: ['nextStep', 'followUpDate', 'notes'] },
    { id: 'outcome', name: 'Lost deal', fields: ['lossReason'], when: { field: 'status', operator: 'eq', value: 'lost' } },
  ] },
}
// CRM adapters add relationships; the reusable work modules have no sales dependencies.
export const salesTaskModule: ModuleSource = { ...taskModule, id: 'sales.task', ports: [...taskModule.ports, { field: 'deal', target: 'sales.deal', label: 'Deal' }], views: taskModule.views.map(view => ({ ...view, columns: ['title', 'deal', 'owner', 'dueDate', 'status'] })) }
export const salesActivityModule: ModuleSource = { ...activityModule, id: 'sales.activity', ports: [{ field: 'deal', target: 'sales.deal', label: 'Deal' }], views: activityModule.views.map(view => ({ ...view, columns: ['title', 'deal', 'kind', 'occurredOn', 'notes'] })) }
export const salesModules = [dealModule, salesTaskModule, salesActivityModule]
