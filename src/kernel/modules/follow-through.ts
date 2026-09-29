import { kernelModuleSchema, type ModuleSource } from '../module-contract'
import type { SavedView } from '../application-views'
import { dealModule, salesTaskModule, salesActivityModule } from './sales'
import { taskModule } from './work'

export const assigneeField = { label: 'Assigned to', type: 'string' as const, format: 'user' as const, required: false, editable: true, default: '', max: 150 }
export function taskWorkViews(): Omit<SavedView, 'entity'>[] {
  const open = { field: 'status', operator: 'eq' as const, value: 'open' }
  const base = { grammar: 'ledger' as const, timeZone: 'UTC', columns: ['title', 'assignee', 'dueDate', 'status'], sort: { field: 'dueDate', direction: 'asc' as const } }
  return [
    { ...base, id: 'my_tasks', name: 'My open tasks', filters: [open, { field: 'assignee', operator: 'is_me', value: true }] },
    { ...base, id: 'tasks_today', name: 'Tasks due today', filters: [open, { field: 'dueDate', operator: 'date_on', value: 0 }] },
    { ...base, id: 'tasks_overdue', name: 'Overdue tasks', filters: [open, { field: 'dueDate', operator: 'date_before', value: 0 }] },
  ]
}
export function dealWorkViews(stages: string[]): Omit<SavedView, 'entity'>[] {
  const active = ['won', 'lost', 'converted'].filter(stage => stages.includes(stage)).map(value => ({ field: 'status', operator: 'neq' as const, value }))
  const base = { grammar: 'ledger' as const, timeZone: 'UTC', columns: ['title', 'customer', 'assignee', 'nextStep', 'followUpDate', 'status'], sort: { field: 'followUpDate', direction: 'asc' as const } }
  return [
    { ...base, id: 'my_deals', name: 'My active deals', filters: [...active, { field: 'assignee', operator: 'is_me', value: true }] },
    { ...base, id: 'deals_today', name: 'Follow up today', filters: [...active, { field: 'followUpDate', operator: 'date_on', value: 0 }] },
    { ...base, id: 'deals_overdue', name: 'Overdue follow-ups', filters: [...active, { field: 'followUpDate', operator: 'date_before', value: 0 }] },
    { ...base, id: 'stalled_deals', name: 'Not updated in 7+ days', filters: [...active, { field: '$updatedAt', operator: 'date_before', value: -7 }] },
    { ...base, id: 'missing_next_step', name: 'Needs a next step', filters: [...active, { field: 'nextStep', operator: 'empty', value: true }] },
  ]
}
function nextRelease(source: ModuleSource, views: Omit<SavedView, 'entity'>[]): ModuleSource {
  const next = kernelModuleSchema.parse(structuredClone(source))
  next.version = 2
  next.definition.entity.fields.assignee = assigneeField
  next.views = [...next.views.map(view => ({ ...view, columns: view.columns.map(key => key === 'owner' ? 'assignee' : key) })), ...views]
  if (next.layout) next.layout.sections[0].fields.push('assignee')
  return next
}
export const taskV2 = nextRelease(taskModule, taskWorkViews())
export const dealV2 = nextRelease(dealModule, dealWorkViews(kernelModuleSchema.parse(dealModule).definition.entity.fields.status.options!))
export const salesTaskV2 = nextRelease(salesTaskModule, taskWorkViews())
salesTaskV2.ports = salesTaskV2.ports.map(port => port.target === 'sales.deal' ? { ...port, targetVersion: 2 } : port)
export const salesActivityV2 = kernelModuleSchema.parse(structuredClone(salesActivityModule))
salesActivityV2.version = 2
salesActivityV2.ports = salesActivityV2.ports.map(port => port.target === 'sales.deal' ? { ...port, targetVersion: 2 } : port)
export const followThroughModules = [taskV2, dealV2, salesTaskV2, salesActivityV2]
