import { definitionSchema, type Definition, type RecordData } from './definition'

function step(name: string, label: string, description: string, from: string, to: string) {
  return {
    name, label, description,
    roles: ['owner', 'operator'] as const, input: {},
    preconditions: [{ id: 'state', label: `Status is ${from}`, field: 'status', operator: 'eq' as const, value: from }],
    policies: [], effects: { status: to },
  }
}

export const crm = definitionSchema.parse({
  slug: 'crm', name: 'CRM',
  description: 'Leads from first contact to conversion. Convert and lose are staged; a human apply commits them.',
  entity: {
    name: 'lead', label: 'Lead',
    fields: {
      title: { label: 'Lead', type: 'string', min: 3, max: 120 },
      company: { label: 'Company', type: 'string', min: 2, max: 80 },
      contact: { label: 'Contact', type: 'string', min: 2, max: 80 },
      source: { label: 'Source', type: 'enum', options: ['Inbound', 'Outbound', 'Referral', 'Event'] },
      status: { label: 'Status', type: 'enum', options: ['draft', 'open', 'converted', 'lost'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('open', 'Open lead', 'Propose moving this lead into the pipeline.', 'draft', 'open'),
    step('convert', 'Convert lead', 'Propose converting this lead to a customer.', 'open', 'converted'),
    step('lose', 'Mark lost', 'Propose closing this lead as lost.', 'open', 'lost'),
  ],
})

export const orders = definitionSchema.parse({
  slug: 'orders', name: 'Orders',
  description: 'Quotes, orders, and invoices. Confirm and invoice are staged; a human apply commits them.',
  entity: {
    name: 'order', label: 'Order',
    fields: {
      title: { label: 'Order', type: 'string', min: 3, max: 120 },
      customer: { label: 'Customer', type: 'string', min: 2, max: 80 },
      amountCents: { label: 'Amount (USD cents)', type: 'integer', min: 1, max: 100000000 },
      status: { label: 'Status', type: 'enum', options: ['draft', 'quoted', 'confirmed', 'invoiced'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('quote', 'Send quote', 'Propose issuing a quote for this order.', 'draft', 'quoted'),
    step('confirm', 'Confirm order', 'Propose confirming the quoted order.', 'quoted', 'confirmed'),
    step('invoice', 'Issue invoice', 'Propose invoicing a confirmed order.', 'confirmed', 'invoiced'),
  ],
})

export const helpdesk = definitionSchema.parse({
  slug: 'helpdesk', name: 'Help desk',
  description: 'Customer tickets from report to resolution. Resolve is staged; a human apply commits it.',
  entity: {
    name: 'ticket', label: 'Ticket',
    fields: {
      title: { label: 'Ticket', type: 'string', min: 3, max: 120 },
      requester: { label: 'Requester', type: 'string', min: 2, max: 80 },
      priority: { label: 'Priority', type: 'enum', options: ['Low', 'Normal', 'High', 'Urgent'] },
      status: { label: 'Status', type: 'enum', options: ['draft', 'open', 'waiting', 'resolved'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('open', 'Open ticket', 'Propose opening this ticket for handling.', 'draft', 'open'),
    step('wait', 'Wait on customer', 'Propose parking the ticket while waiting on the requester.', 'open', 'waiting'),
    step('resume', 'Resume ticket', 'Propose returning this ticket to open work.', 'waiting', 'open'),
    step('resolve', 'Resolve ticket', 'Propose resolving this ticket.', 'open', 'resolved'),
  ],
})

export const projects = definitionSchema.parse({
  slug: 'projects', name: 'Projects',
  description: 'Lightweight project tracking. Start, flag, and complete are staged; a human apply commits them.',
  entity: {
    name: 'project', label: 'Project',
    fields: {
      title: { label: 'Project', type: 'string', min: 3, max: 120 },
      owner: { label: 'Owner', type: 'string', min: 2, max: 80 },
      milestone: { label: 'Milestone', type: 'string', min: 2, max: 80 },
      status: { label: 'Status', type: 'enum', options: ['draft', 'active', 'at_risk', 'done'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('start', 'Start project', 'Propose moving this project to active work.', 'draft', 'active'),
    step('flag', 'Flag at risk', 'Propose marking this project at risk.', 'active', 'at_risk'),
    step('unflag', 'Clear risk', 'Propose returning this project to active work.', 'at_risk', 'active'),
    step('complete', 'Complete project', 'Propose completing this project.', 'active', 'done'),
  ],
})

export const assets = definitionSchema.parse({
  slug: 'assets', name: 'IT assets',
  description: 'IT and office asset lifecycle. Assign and retire are staged; a human apply commits them.',
  entity: {
    name: 'asset', label: 'Asset',
    fields: {
      title: { label: 'Asset', type: 'string', min: 3, max: 120 },
      vendor: { label: 'Vendor', type: 'string', min: 2, max: 80 },
      assignee: { label: 'Assignee', type: 'string', required: false, max: 80, default: '' },
      status: { label: 'Status', type: 'enum', options: ['draft', 'in_stock', 'assigned', 'retired'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('stock', 'Put in stock', 'Propose adding this asset to inventory.', 'draft', 'in_stock'),
    {
      name: 'assign', label: 'Assign asset', description: 'Propose assigning this asset to a person.',
      roles: ['owner', 'operator'],
      input: { assignee: { label: 'Assignee', type: 'string', min: 2, max: 80 } },
      preconditions: [{ id: 'state', label: 'Status is in_stock', field: 'status', operator: 'eq', value: 'in_stock' }],
      policies: [], effects: { status: 'assigned', assignee: '$input.assignee' },
    },
    step('retire', 'Retire asset', 'Propose retiring this asset.', 'assigned', 'retired'),
  ],
})

export const hr = definitionSchema.parse({
  slug: 'hr', name: 'HR',
  description: 'Employee records, leave, and offboarding. Those actions are staged; a human apply commits them.',
  entity: {
    name: 'employee', label: 'Employee',
    fields: {
      title: { label: 'Employee', type: 'string', min: 3, max: 80 },
      department: { label: 'Department', type: 'enum', options: ['Operations', 'Engineering', 'Sales', 'People'] },
      role: { label: 'Role', type: 'string', min: 2, max: 80 },
      status: { label: 'Status', type: 'enum', options: ['draft', 'active', 'on_leave', 'offboarded'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('onboard', 'Onboard', 'Propose activating this employee record.', 'draft', 'active'),
    step('leave', 'Start leave', 'Propose placing this employee on leave.', 'active', 'on_leave'),
    step('return', 'Return from leave', 'Propose returning this employee to active work.', 'on_leave', 'active'),
    step('offboard', 'Offboard', 'Propose offboarding this employee.', 'active', 'offboarded'),
  ],
})

export const audit = definitionSchema.parse({
  slug: 'audit', name: 'Audit',
  description: 'Audit findings, evidence notes, and remediation. Assess, remediate, and close are staged; a human apply commits them. Assessments are kernel actions, not a live model.',
  entity: {
    name: 'finding', label: 'Finding',
    fields: {
      title: { label: 'Finding', type: 'string', min: 3, max: 120 },
      code: { label: 'Issue number', type: 'string', min: 3, max: 20 },
      severity: { label: 'Severity', type: 'enum', options: ['Critical', 'High', 'Medium', 'Low'] },
      area: { label: 'Control area', type: 'enum', options: ['Access control', 'Change management', 'Data protection', 'Vendor risk', 'Financial close', 'Physical security'] },
      owner: { label: 'Owner', type: 'string', min: 2, max: 80 },
      due: { label: 'Target date (YYYY-MM-DD)', type: 'string', min: 10, max: 10 },
      evidence: { label: 'Evidence note', type: 'string', required: false, max: 400, default: '' },
      source: { label: 'Source', type: 'enum', options: ['Human', 'Agent'] },
      assessed: { label: 'Assessed', type: 'boolean', default: false, editable: false },
      assessment: { label: 'Assessment', type: 'string', required: false, max: 800, default: '', editable: false },
      confidence: { label: 'Confidence (0–100)', type: 'integer', min: 0, max: 100, default: 0, editable: false },
      status: { label: 'Status', type: 'enum', options: ['draft', 'open', 'remediating', 'closed', 'waived'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    step('open', 'Open finding', 'Propose moving this finding into the register.', 'draft', 'open'),
    {
      name: 'assess', label: 'Record assessment', description: 'Propose an evidence assessment and confidence score. This stages a kernel action; it does not call a language model.',
      roles: ['owner', 'operator'],
      input: {
        assessment: { label: 'Assessment', type: 'string', min: 8, max: 800 },
        confidence: { label: 'Confidence (0–100)', type: 'integer', min: 0, max: 100 },
      },
      preconditions: [{ id: 'state', label: 'Status is open', field: 'status', operator: 'eq', value: 'open' }],
      policies: [],
      effects: { assessed: true, assessment: '$input.assessment', confidence: '$input.confidence' },
    },
    {
      name: 'remediate', label: 'Start remediation', description: 'Propose moving an assessed finding into remediation.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Status is open', field: 'status', operator: 'eq', value: 'open' }],
      policies: [{ id: 'assessed', label: 'Assessment is recorded', field: 'assessed', operator: 'eq', value: true }],
      effects: { status: 'remediating' },
    },
    step('close', 'Close finding', 'Propose closing a remediating finding.', 'remediating', 'closed'),
    step('waive', 'Waive finding', 'Propose waiving this finding without remediation.', 'open', 'waived'),
  ],
})

export const suite: Definition[] = [crm, orders, helpdesk, projects, assets, hr, audit]

export function seedSuite(slug: string): { entity: string; data: RecordData; hoursAgo: number }[] {
  if (slug === 'crm') {
    return [
      { entity: crm.entity.name, hoursAgo: 5, data: { title: 'Northwind Foods', company: 'Northwind', contact: 'Pat Lee', source: 'Inbound', status: 'open' } },
      { entity: crm.entity.name, hoursAgo: 3, data: { title: 'Fieldwork Studio', company: 'Fieldwork Studio', contact: 'Sam Ortiz', source: 'Referral', status: 'converted' } },
      { entity: crm.entity.name, hoursAgo: 1, data: { title: 'Harbor Labs', company: 'Harbor Labs', contact: 'Kim Adeyemi', source: 'Outbound', status: 'draft' } },
    ]
  }
  if (slug === 'orders') {
    return [
      { entity: orders.entity.name, hoursAgo: 4, data: { title: 'Annual licenses · Northwind', customer: 'Northwind', amountCents: 840000, status: 'quoted' } },
      { entity: orders.entity.name, hoursAgo: 2, data: { title: 'Discovery workshop', customer: 'Fieldwork Studio', amountCents: 1250000, status: 'confirmed' } },
      { entity: orders.entity.name, hoursAgo: 1, data: { title: 'Pilot seats', customer: 'Harbor Labs', amountCents: 192000, status: 'draft' } },
    ]
  }
  if (slug === 'helpdesk') {
    return [
      { entity: helpdesk.entity.name, hoursAgo: 4, data: { title: 'Cannot export invoices', requester: 'Pat Lee', priority: 'High', status: 'open' } },
      { entity: helpdesk.entity.name, hoursAgo: 2, data: { title: 'SSO login loop', requester: 'Sam Ortiz', priority: 'Urgent', status: 'waiting' } },
      { entity: helpdesk.entity.name, hoursAgo: 1, data: { title: 'Add a second billing contact', requester: 'Kim Adeyemi', priority: 'Low', status: 'draft' } },
    ]
  }
  if (slug === 'projects') {
    return [
      { entity: projects.entity.name, hoursAgo: 6, data: { title: 'Storefront relaunch', owner: 'Pat Lee', milestone: 'Content freeze', status: 'active' } },
      { entity: projects.entity.name, hoursAgo: 3, data: { title: 'Billing cutover', owner: 'Sam Ortiz', milestone: 'Dual-run week', status: 'at_risk' } },
      { entity: projects.entity.name, hoursAgo: 1, data: { title: 'Help desk playbooks', owner: 'Kim Adeyemi', milestone: 'Kickoff', status: 'draft' } },
    ]
  }
  if (slug === 'assets') {
    return [
      { entity: assets.entity.name, hoursAgo: 5, data: { title: 'MacBook Pro 14', vendor: 'Apple', assignee: 'Pat Lee', status: 'assigned' } },
      { entity: assets.entity.name, hoursAgo: 2, data: { title: 'Display · 27 inch', vendor: 'Dell Technologies', assignee: '', status: 'in_stock' } },
      { entity: assets.entity.name, hoursAgo: 1, data: { title: 'Security key set', vendor: 'Yubico', assignee: '', status: 'draft' } },
    ]
  }
  if (slug === 'hr') {
    return [
      { entity: hr.entity.name, hoursAgo: 8, data: { title: 'Pat Lee', department: 'Operations', role: 'Operator', status: 'active' } },
      { entity: hr.entity.name, hoursAgo: 4, data: { title: 'Sam Ortiz', department: 'Sales', role: 'Account lead', status: 'on_leave' } },
      { entity: hr.entity.name, hoursAgo: 1, data: { title: 'Kim Adeyemi', department: 'Engineering', role: 'Incoming engineer', status: 'draft' } },
    ]
  }
  if (slug === 'audit') {
    return [
      {
        entity: audit.entity.name, hoursAgo: 8,
        data: {
          title: 'Backup restore untested', code: 'AUD-1038', severity: 'Medium', area: 'Data protection',
          owner: 'Sam Ortiz', due: '2026-08-30', evidence: 'Restore drill log · August example.', source: 'Human',
          assessed: true, assessment: 'Restore has not been proven in the current environment. Treat as a control gap until a successful drill is recorded.', confidence: 81, status: 'closed',
        },
      },
      {
        entity: audit.entity.name, hoursAgo: 5,
        data: {
          title: 'Vendor SOC report gap', code: 'AUD-1042', severity: 'High', area: 'Vendor risk',
          owner: 'Pat Lee', due: '2026-09-01', evidence: 'SOC request thread · example vendor file reference.', source: 'Human',
          assessed: true, assessment: 'The current letter does not cover subprocessors named in the processing addendum.', confidence: 74, status: 'remediating',
        },
      },
      {
        entity: audit.entity.name, hoursAgo: 3,
        data: {
          title: 'Privileged access recertification', code: 'AUD-1044', severity: 'Critical', area: 'Access control',
          owner: 'Kim Adeyemi', due: '2026-10-12', evidence: 'Admin role export · Q3 example.', source: 'Agent',
          assessed: false, assessment: '', confidence: 0, status: 'open',
        },
      },
      {
        entity: audit.entity.name, hoursAgo: 1,
        data: {
          title: 'Physical key inventory', code: 'AUD-1047', severity: 'Low', area: 'Physical security',
          owner: 'Pat Lee', due: '2026-11-02', evidence: '', source: 'Human',
          assessed: false, assessment: '', confidence: 0, status: 'draft',
        },
      },
    ]
  }
  return []
}
