import { definitionSchema, type Definition } from './definition'
import { procurement } from './procurement'
import type { RecordLayout } from './application-layouts'
import type { SavedView } from './application-views'
import { composeSurface } from './blocks'

/** Core catalog of assemblable modules. Applications are compiled from these; they are not generated entity schemas. */

export type LinkPort = { field: string; target: string; label: string; required?: boolean }
export type ModuleKind = 'queue' | 'directory'

export function portRequired(port: LinkPort) {
  return port.required !== false
}

export type ModuleView = Omit<SavedView, 'entity'>
export type ModuleLayout = Omit<RecordLayout, 'entity'>

export type KernelModule = {
  id: string
  defaultAlias: string
  definition: Definition
  ports: LinkPort[]
  views: ModuleView[]
  layout?: ModuleLayout
  kind?: ModuleKind
}

function requestModule(): KernelModule {
  const definition = structuredClone(procurement)
  delete definition.entity.fields.supplier
  definition.slug = 'request'
  return {
    id: 'purchasing.request',
    defaultAlias: 'requests',
    definition: definitionSchema.parse(definition),
    ports: [{ field: 'supplier', target: 'directory.party', label: 'Supplier' }],
    views: [{
      id: 'awaiting_decision',
      name: 'Awaiting decision',
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

function partyModule(): KernelModule {
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
    views: [{
      id: 'active',
      name: 'Active',
      filters: [{ field: 'status', operator: 'eq', value: 'active' }],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'contact', 'status'],
    }],
  }
}

function opportunityModule(): KernelModule {
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
    views: [{
      id: 'open',
      name: 'Open pipeline',
      filters: [{ field: 'status', operator: 'eq', value: 'open' }],
      sort: { field: '$createdAt', direction: 'desc' },
      columns: ['title', 'customer', 'source', 'status'],
    }],
    layout: {
      sections: [
        { id: 'opportunity', name: 'Opportunity', fields: ['title', 'customer', 'source'] },
        { id: 'progress', name: 'Pipeline progress', fields: ['status'], when: { field: 'status', operator: 'neq', value: 'draft' } },
      ],
    },
  }
}

function projectModule(): KernelModule {
  return {
    id: 'work.project',
    defaultAlias: 'projects',
    kind: 'queue',
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

function issueModule(): KernelModule {
  return {
    id: 'work.issue',
    defaultAlias: 'issues',
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
        filters: [],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'project', 'assignee', 'priority', 'status'],
      },
      {
        id: 'backlog',
        name: 'Backlog',
        filters: [{ field: 'status', operator: 'eq', value: 'backlog' }],
        sort: { field: '$createdAt', direction: 'desc' },
        columns: ['title', 'project', 'assignee', 'priority', 'status'],
      },
      {
        id: 'started',
        name: 'Started',
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

export const kernelModules: KernelModule[] = [requestModule(), opportunityModule(), partyModule(), projectModule(), issueModule()]

export function listModules() {
  return kernelModules
}

export function moduleKind(mod: KernelModule): ModuleKind {
  return mod.kind ?? (mod.ports.length ? 'queue' : 'directory')
}

export function moduleSurfaces(mod: KernelModule) {
  const kind = moduleKind(mod)
  return [
    ...mod.views.map(view => ({ kind, view: view.id, name: view.name, blocks: composeSurface(kind).map(block => block.id) })),
    ...(mod.layout ? [{ kind: 'detail' as const, name: `${mod.definition.entity.label} details`, blocks: composeSurface('detail').map(block => block.id) }] : []),
  ]
}

export function catalogSnapshot() {
  return kernelModules.map(mod => ({
    id: mod.id,
    name: mod.definition.name,
    description: mod.definition.description,
    defaultAlias: mod.defaultAlias,
    settings: mod.definition.settings,
    ports: mod.ports.map(port => ({ ...port, required: portRequired(port) })),
    views: mod.views.map(view => ({ id: view.id, name: view.name })),
    layout: Boolean(mod.layout),
    actions: mod.definition.actions.map(action => ({ name: action.name, label: action.label, description: action.description })),
    surfaces: moduleSurfaces(mod),
  }))
}

export type CatalogSnapshot = ReturnType<typeof catalogSnapshot>[number]

export function moduleById(id: string) {
  return kernelModules.find(item => item.id === id)
}
