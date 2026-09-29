import type { ModuleSource } from '../module-contract'
import { text, date, status, transition, archive, base } from './fields'

export const taskModule: ModuleSource = {
  ...base, id: 'work.task', defaultAlias: 'tasks', grammar: 'ledger',
  ports: [{ field: 'owner', target: 'directory.person', label: 'Assignee', required: false }],
  definition: {
    slug: 'task', name: 'Tasks', description: 'Assigned work with a due date and completion history.',
    entity: { name: 'task', label: 'Task', fields: { title: { label: 'Task', type: 'string', min: 3, max: 120 }, dueDate: date('Due date'), notes: text('Notes', 4000), status: status(['open', 'completed']) } },
    settings: {}, reviewerRoles: ['owner'], actions: [transition('complete', 'Complete task', 'open', 'completed'), transition('reopen', 'Reopen task', 'completed', 'open')],
  }, views: [{ id: 'tasks', name: 'Open tasks', columns: ['title', 'owner', 'dueDate', 'status'], filters: [{ field: 'status', operator: 'eq', value: 'open' }], sort: { field: 'dueDate', direction: 'asc' } }],
}
export const activityModule: ModuleSource = {
  ...base, id: 'work.activity', defaultAlias: 'activities', grammar: 'ledger', ports: [],
  definition: {
    slug: 'activity', name: 'Activities', description: 'Recorded calls, meetings, emails and notes. Recording an email does not send one.',
    entity: { name: 'activity', label: 'Activity', fields: { title: { label: 'Subject', type: 'string', min: 3, max: 120 }, kind: { label: 'Type', type: 'enum', options: ['Call', 'Meeting', 'Email', 'Note'], default: 'Call' }, occurredOn: date('Activity date'), notes: text('Summary and commitments', 4000), status: status(['active', 'archived']) } },
    settings: {}, reviewerRoles: ['owner'], actions: [archive],
  }, views: [{ id: 'activities', name: 'Activity log', columns: ['title', 'kind', 'occurredOn', 'notes'], sort: { field: 'occurredOn', direction: 'desc' } }],
}

export const workModules = [taskModule, activityModule]
