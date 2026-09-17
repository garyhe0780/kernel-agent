import { definitionSchema } from './definition'

/** Legacy single-entity purchasing fixture. Not a Core module. */
export const procurement = definitionSchema.parse({
  slug: 'procurement', name: 'Procurement',
  description: 'From purchase request to an approved decision, with a reviewable record of every change.',
  entity: {
    name: 'purchase_request', label: 'Purchase request',
    fields: {
      title: { label: 'Request', type: 'string', min: 3, max: 100 },
      supplier: { label: 'Supplier', type: 'string', min: 2, max: 80 },
      amountCents: { label: 'Amount (USD cents)', type: 'integer', min: 1, max: 100000000 },
      category: { label: 'Category', type: 'enum', options: ['Software', 'Equipment', 'Services', 'Office'] },
      justification: { label: 'Business reason', type: 'string', min: 5, max: 1000 },
      supplierVerified: { label: 'Supplier verified', type: 'boolean', default: false },
      status: { label: 'Status', type: 'enum', options: ['draft', 'submitted', 'approved', 'declined'], default: 'draft', editable: false },
      decisionNote: { label: 'Decision note', type: 'string', required: false, max: 500, default: '', editable: false },
    },
  },
  settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true },
  reviewerRoles: ['owner'],
  actions: [
    {
      name: 'submit', label: 'Submit request', description: 'Propose moving a draft purchase request into review.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Request is a draft', field: 'status', operator: 'eq', value: 'draft' }],
      policies: [], effects: { status: 'submitted' },
    },
    {
      name: 'approve', label: 'Approve purchase', description: 'Propose approval after checking the spending limit and supplier verification. A human must apply the proposal.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Request is submitted', field: 'status', operator: 'eq', value: 'submitted' }],
      policies: [
        { id: 'spend', label: 'Within approval limit', field: 'amountCents', operator: 'lte', setting: 'approvalLimitCents' },
        { id: 'supplier', label: 'Supplier is verified', field: 'supplierVerified', operator: 'eq', value: true, enabledBy: 'requireVerifiedSupplier' },
      ], effects: { status: 'approved' },
    },
    {
      name: 'decline', label: 'Decline purchase', description: 'Propose declining a submitted request, with a required decision reason.',
      roles: ['owner', 'operator'],
      input: { reason: { label: 'Decision reason', type: 'string', min: 5, max: 500 } },
      preconditions: [{ id: 'state', label: 'Request is submitted', field: 'status', operator: 'eq', value: 'submitted' }],
      policies: [], effects: { status: 'declined', decisionNote: '$input.reason' },
    },
  ],
})
