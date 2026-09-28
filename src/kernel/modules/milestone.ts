import type { ModuleSource } from '../module-contract'

/** A local extension using the same directory and project ports as other work modules. */
export const milestoneModule = {
  contractVersion: 1, id: 'work.milestone', version: 1, defaultAlias: 'milestones', grammar: 'ledger',
  definition: {
    slug: 'milestone', name: 'Milestones', description: 'Track project milestones with reviewed completion.',
    entity: { name: 'milestone', label: 'Milestone', fields: {
      title: { label: 'Milestone', type: 'string', min: 2, max: 120 },
      status: { label: 'Status', type: 'enum', options: ['planned', 'completed'], default: 'planned', editable: false },
      completionNote: { label: 'Completion note', type: 'string', required: false, default: '', max: 500 },
    } },
    settings: {}, reviewerRoles: ['owner'],
    actions: [{ name: 'complete', label: 'Complete milestone', description: 'Propose completing a project milestone with a note.', roles: ['owner', 'operator'], input: { note: { label: 'Completion note', type: 'string', min: 3, max: 500 } }, preconditions: [{ id: 'planned', label: 'Milestone is planned', field: 'status', operator: 'eq', value: 'planned' }], policies: [], effects: { status: 'completed', completionNote: '$input.note' } }],
  },
  ports: [
    { field: 'project', target: 'work.project', targetVersion: 1, label: 'Project' },
    { field: 'owner', target: 'directory.party', targetVersion: 1, label: 'Owner', required: false },
  ],
  views: [{ id: 'planned_milestones', name: 'Planned milestones', filters: [{ field: 'status', operator: 'eq', value: 'planned' }], columns: ['title', 'project', 'owner', 'status'] }],
  layout: { sections: [{ id: 'milestone', name: 'Milestone', fields: ['title', 'project', 'owner', 'status', 'completionNote'] }] },
} satisfies ModuleSource
