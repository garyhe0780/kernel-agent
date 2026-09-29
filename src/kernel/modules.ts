import { definitionSchema } from './definition'
import { procurement } from './procurement'
import { createModuleCatalog, type KernelModule, type ModuleSource } from './module-contract'
import { relationshipConsistencyModules } from './modules/relationship-consistency'
import { followThroughModules } from './modules/follow-through'
import { memberOwnershipModules } from './modules/member-ownership'
import { forecastingModules } from './modules/forecasting'
import { directoryModules } from './modules/directory'
import { workModules } from './modules/work'
import { salesModules } from './modules/sales'
import { milestoneModule } from './modules/milestone'
export type { KernelModule } from './module-contract'

import { composeSurface } from './blocks'
import { resolveViewGrammar, type WorkingGrammar } from './grammars'

/** Core catalog of assemblable modules. Applications are compiled from these; they are not generated entity schemas. */

export type LinkPort = KernelModule['ports'][number]
export function portRequired(port: Pick<LinkPort, 'required'>) { return port.required !== false }
export type ModuleView = KernelModule['views'][number]
type ModuleBody = Omit<ModuleSource, 'version' | 'contractVersion'>

function requestModule(): ModuleBody {
  const definition = structuredClone(procurement)
  delete definition.entity.fields.supplier
  definition.slug = 'request'
  return {
    id: 'purchasing.request',
    defaultAlias: 'requests',
    definition: definitionSchema.parse(definition),
    ports: [{ field: 'supplier', target: 'directory.party', label: 'Supplier' }],
    grammar: 'ledger',
    views: [{
      id: 'awaiting_decision',
      name: 'Awaiting decision',
      grammar: 'ledger',
      filters: [{ field: 'status', operator: 'eq', value: 'submitted' }],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'supplier', 'amountCents', 'status'],
    }],
    layout: {
      sections: [
        { id: 'purchase', name: 'Purchase', fields: ['title', 'supplier', 'amountCents', 'category', 'justification'] },
        { id: 'decision', name: 'Decision', fields: ['status', 'supplierVerified', 'decisionNote'] },
      ],
    },
  }
}

function partyModule(): ModuleBody {
  return {
    id: 'directory.party',
    defaultAlias: 'parties',
    definition: definitionSchema.parse({
      slug: 'party', name: 'Directory', description: 'People and organizations the team works with.',
      entity: {
        name: 'party', label: 'Party',
        fields: {
          title: { label: 'Name', type: 'string', min: 2, max: 100 },
          contact: { label: 'Contact', type: 'string', required: false, default: '', max: 150 },
          status: { label: 'Status', type: 'enum', options: ['active', 'archived'], default: 'active', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [{
        name: 'archive', label: 'Archive', description: 'Keep the record and mark it archived.',
        roles: ['owner', 'operator'], input: {},
        preconditions: [{ id: 'active', label: 'Record is active', field: 'status', operator: 'eq', value: 'active' }],
        policies: [], effects: { status: 'archived' },
      }],
    }),
    ports: [],
    grammar: 'directory',
    views: [{
      id: 'active',
      name: 'Active',
      grammar: 'directory',
      filters: [{ field: 'status', operator: 'eq', value: 'active' }],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'contact', 'status'],
    }],
  }
}

function opportunityModule(): ModuleBody {
  return {
    id: 'sales.opportunity',
    defaultAlias: 'opportunities',
    definition: definitionSchema.parse({
      slug: 'opportunity', name: 'Opportunities',
      description: 'Leads from first contact to conversion. Convert and lose are staged; a human apply commits them.',
      entity: {
        name: 'opportunity', label: 'Opportunity',
        fields: {
          title: { label: 'Opportunity', type: 'string', min: 3, max: 120 },
          source: { label: 'Source', type: 'enum', options: ['Inbound', 'Outbound', 'Referral', 'Event'] },
          status: { label: 'Status', type: 'enum', options: ['draft', 'open', 'converted', 'lost'], default: 'draft', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [
        { name: 'open', label: 'Open opportunity', description: 'Propose moving this opportunity into the pipeline.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Opportunity is a draft', field: 'status', operator: 'eq', value: 'draft' }], policies: [], effects: { status: 'open' } },
        { name: 'convert', label: 'Convert opportunity', description: 'Propose converting this opportunity to a customer.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Opportunity is open', field: 'status', operator: 'eq', value: 'open' }], policies: [], effects: { status: 'converted' } },
        { name: 'lose', label: 'Mark lost', description: 'Propose closing this opportunity as lost.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Opportunity is open', field: 'status', operator: 'eq', value: 'open' }], policies: [], effects: { status: 'lost' } },
      ],
    }),
    ports: [{ field: 'customer', target: 'directory.party', label: 'Customer' }],
    grammar: 'board',
    views: [
      {
        id: 'overview',
        name: 'Pipeline overview',
        grammar: 'overview',
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'customer', 'source', 'status'],
      },
      {
        id: 'pipeline',
        name: 'Opportunity board',
        grammar: 'board',
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'customer', 'source', 'status'],
      },
    ],
    layout: {
      sections: [
        { id: 'opportunity', name: 'Opportunity', fields: ['title', 'customer', 'source'] },
        { id: 'progress', name: 'Pipeline progress', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'draft' } },
      ],
    },
  }
}

function projectModule(): ModuleBody {
  return {
    id: 'work.project',
    defaultAlias: 'projects',
    grammar: 'ledger',
    definition: definitionSchema.parse({
      slug: 'project', name: 'Projects',
      description: 'Named workstreams that group issues. Start, complete and cancel are staged; a human apply commits them.',
      entity: {
        name: 'project', label: 'Project',
        fields: {
          title: { label: 'Project', type: 'string', min: 2, max: 120 },
          summary: { label: 'Summary', type: 'string', required: false, default: '', max: 500 },
          status: { label: 'Status', type: 'enum', options: ['planned', 'started', 'completed', 'canceled'], default: 'planned', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [
        { name: 'start', label: 'Start project', description: 'Propose moving this project from planned into active work.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Project is planned', field: 'status', operator: 'eq', value: 'planned' }], policies: [], effects: { status: 'started' } },
        { name: 'complete', label: 'Complete project', description: 'Propose completing this project.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Project is started', field: 'status', operator: 'eq', value: 'started' }], policies: [], effects: { status: 'completed' } },
        { name: 'cancel', label: 'Cancel project', description: 'Propose canceling this started project.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Project is started', field: 'status', operator: 'eq', value: 'started' }], policies: [], effects: { status: 'canceled' } },
      ],
    }),
    ports: [],
    views: [{
      id: 'planned',
      name: 'Planned',
      grammar: 'ledger',
      filters: [{ field: 'status', operator: 'eq', value: 'planned' }],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'summary', 'status'],
    }],
    layout: {
      sections: [
        { id: 'project', name: 'Project', fields: ['title', 'summary'] },
        { id: 'progress', name: 'Progress', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'planned' } },
      ],
    },
  }
}

function issueModule(): ModuleBody {
  return {
    id: 'work.issue',
    defaultAlias: 'issues',
    grammar: 'board',
    definition: definitionSchema.parse({
      slug: 'issue', name: 'Issues',
      description: 'Work items on a project, with optional assignee. Start, complete and cancel are staged; a human apply commits them.',
      entity: {
        name: 'issue', label: 'Issue',
        fields: {
          title: { label: 'Issue', type: 'string', min: 2, max: 160 },
          description: { label: 'Description', type: 'string', required: false, default: '', max: 2000 },
          priority: { label: 'Priority', type: 'enum', options: ['urgent', 'high', 'medium', 'low', 'none'], default: 'none' },
          status: { label: 'Status', type: 'enum', options: ['backlog', 'started', 'done', 'canceled'], default: 'backlog', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [
        { name: 'start', label: 'Start issue', description: 'Propose moving this issue from the backlog into active work.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Issue is in the backlog', field: 'status', operator: 'eq', value: 'backlog' }], policies: [], effects: { status: 'started' } },
        { name: 'complete', label: 'Complete issue', description: 'Propose completing this started issue.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Issue is started', field: 'status', operator: 'eq', value: 'started' }], policies: [], effects: { status: 'done' } },
        { name: 'cancel', label: 'Cancel issue', description: 'Propose canceling this started issue.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Issue is started', field: 'status', operator: 'eq', value: 'started' }], policies: [], effects: { status: 'canceled' } },
      ],
    }),
    ports: [
      { field: 'project', target: 'work.project', label: 'Project' },
      { field: 'assignee', target: 'directory.party', label: 'Assignee', required: false },
    ],
    views: [
      {
        id: 'board',
        name: 'Issue board',
        grammar: 'board',
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'project', 'assignee', 'priority', 'status'],
      },
      {
        id: 'backlog',
        name: 'Backlog',
        grammar: 'ledger',
        filters: [{ field: 'status', operator: 'eq', value: 'backlog' }],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'project', 'assignee', 'priority', 'status'],
      },
      {
        id: 'started',
        name: 'Started',
        grammar: 'ledger',
        filters: [{ field: 'status', operator: 'eq', value: 'started' }],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'project', 'assignee', 'priority', 'status'],
      },
    ],
    layout: {
      sections: [
        { id: 'issue', name: 'Issue', fields: ['title', 'description', 'project', 'assignee', 'priority'] },
        { id: 'progress', name: 'Progress', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'backlog' } },
      ],
    },
  }
}

function movementModule(): ModuleBody {
  return {
    id: 'finance.movement',
    defaultAlias: 'movements',
    grammar: 'ledger',
    definition: definitionSchema.parse({
      slug: 'movement', name: 'Movements',
      description: 'Inbound and outbound money movements. Post and fail are staged; a human apply commits them. Amount is unsigned cents plus a required direction.',
      entity: {
        name: 'movement', label: 'Movement',
        fields: {
          title: { label: 'Movement', type: 'string', min: 2, max: 120 },
          amountCents: { label: 'Amount (USD cents)', type: 'integer', min: 1, max: 100000000 },
          direction: { label: 'Direction', type: 'enum', options: ['inbound', 'outbound'] },
          note: { label: 'Note', type: 'string', required: false, default: '', max: 500 },
          status: { label: 'Status', type: 'enum', options: ['draft', 'posted', 'failed'], default: 'draft', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [
        { name: 'post', label: 'Post movement', description: 'Propose posting this draft movement. A human apply commits it.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Movement is a draft', field: 'status', operator: 'eq', value: 'draft' }], policies: [], effects: { status: 'posted' } },
        { name: 'fail', label: 'Mark failed', description: 'Propose marking this draft movement as failed. A human apply commits it.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Movement is a draft', field: 'status', operator: 'eq', value: 'draft' }], policies: [], effects: { status: 'failed' } },
      ],
    }),
    ports: [{ field: 'counterparty', target: 'directory.party', label: 'Counterparty' }],
    views: [
      {
        id: 'ledger',
        name: 'Movements',
        grammar: 'ledger',
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'counterparty', 'amountCents', 'direction', 'status'],
      },
      {
        id: 'overview',
        name: 'Movement overview',
        grammar: 'overview',
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'counterparty', 'amountCents', 'direction', 'status'],
      },
    ],
    layout: {
      sections: [
        { id: 'movement', name: 'Movement', fields: ['title', 'counterparty', 'amountCents', 'direction', 'note'] },
        { id: 'posting', name: 'Posting', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'draft' } },
      ],
    },
  }
}

function ticketModule(): ModuleBody {
  return {
    id: 'support.ticket',
    defaultAlias: 'tickets',
    grammar: 'board',
    definition: definitionSchema.parse({
      slug: 'ticket', name: 'Tickets',
      description: 'Support tickets from a requester. Wait, resolve, resume and reopen are staged; a human apply commits them. Tickets do not belong to a project.',
      entity: {
        name: 'ticket', label: 'Ticket',
        fields: {
          title: { label: 'Ticket', type: 'string', min: 2, max: 160 },
          description: { label: 'Description', type: 'string', required: false, default: '', max: 2000 },
          status: { label: 'Status', type: 'enum', options: ['open', 'waiting', 'resolved'], default: 'open', editable: false },
        },
      },
      settings: {},
      reviewerRoles: ['owner'],
      actions: [
        { name: 'wait', label: 'Wait on ticket', description: 'Propose waiting on this open ticket until the requester replies.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Ticket is open', field: 'status', operator: 'eq', value: 'open' }], policies: [], effects: { status: 'waiting' } },
        { name: 'resolve', label: 'Resolve ticket', description: 'Propose resolving this open ticket.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Ticket is open', field: 'status', operator: 'eq', value: 'open' }], policies: [], effects: { status: 'resolved' } },
        { name: 'resume', label: 'Resume ticket', description: 'Propose returning this waiting ticket to open.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Ticket is waiting', field: 'status', operator: 'eq', value: 'waiting' }], policies: [], effects: { status: 'open' } },
        { name: 'reopen', label: 'Reopen ticket', description: 'Propose reopening this resolved ticket.', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: 'Ticket is resolved', field: 'status', operator: 'eq', value: 'resolved' }], policies: [], effects: { status: 'open' } },
      ],
    }),
    ports: [{ field: 'requester', target: 'directory.party', label: 'Requester' }],
    views: [{
      id: 'board',
      name: 'Ticket board',
      grammar: 'board',
      filters: [],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'requester', 'status'],
    }],
    layout: {
      sections: [
        { id: 'ticket', name: 'Ticket', fields: ['title', 'description', 'requester'] },
        { id: 'progress', name: 'Progress', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'open' } },
      ],
    },
  }
}

export const moduleCatalog = createModuleCatalog([
  ...[requestModule(), opportunityModule(), partyModule(), projectModule(), issueModule(), movementModule(), ticketModule()].map(mod => ({ ...mod, contractVersion: 1, version: 1 })),
  milestoneModule,
  ...directoryModules,
  ...workModules,
  ...salesModules,
  ...followThroughModules, ...relationshipConsistencyModules, ...memberOwnershipModules, ...forecastingModules,
])
export const kernelModules = moduleCatalog.list()

export function listModules() {
  return moduleCatalog.list()
}

export function moduleGrammar(mod: KernelModule): WorkingGrammar {
  return mod.grammar ?? (mod.ports.length ? 'ledger' : 'directory')
}

export function viewGrammar(mod: KernelModule, view: ModuleView): WorkingGrammar {
  return view.grammar ? resolveViewGrammar(view) : moduleGrammar(mod)
}

export function moduleSurfaces(mod: KernelModule) {
  return [
    ...mod.views.map(view => {
      const grammar = viewGrammar(mod, view)
      return { grammar, view: view.id, name: view.name, blocks: composeSurface(grammar).map(block => block.id) }
    }),
    ...(mod.layout ? [{ grammar: 'detail' as const, name: `${mod.definition.entity.label} details`, blocks: composeSurface('detail').map(block => block.id) }] : []),
  ]
}

export function catalogSnapshot() {
  return moduleCatalog.list().map(mod => ({
    id: mod.id,
    version: mod.version,
    contractVersion: mod.contractVersion,
    name: mod.definition.name,
    description: mod.definition.description,
    defaultAlias: mod.defaultAlias,
    settings: mod.definition.settings,
    ports: mod.ports.map(port => ({ ...port, required: portRequired(port) })),
    grammar: moduleGrammar(mod),
    views: mod.views.map(view => ({ id: view.id, name: view.name, grammar: viewGrammar(mod, view) })),
    layout: Boolean(mod.layout),
    actions: mod.definition.actions.map(action => ({ name: action.name, label: action.label, description: action.description })),
    surfaces: moduleSurfaces(mod),
  }))
}

export type CatalogSnapshot = ReturnType<typeof catalogSnapshot>[number]

export function moduleById(id: string, version = 1) {
  return moduleCatalog.get(id, version)
}
