export const text = (label: string, max = 150) => ({ label, type: 'string' as const, required: false, default: '', max })
export const date = (label: string) => ({ ...text(label, 10), format: 'date' as const })
export const status = (options: string[], initial = options[0]) => ({ label: 'Status', type: 'enum' as const, options, default: initial, editable: false })
export const transition = (name: string, label: string, from: string, to: string) => ({
  name, label, description: `${label} and record the change in activity.`, humanExecution: 'direct' as const,
  roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: `Record is ${from}`, field: 'status', operator: 'eq' as const, value: from }], policies: [], effects: { status: to },
})
export const archive = transition('archive', 'Archive', 'active', 'archived')
export const base = { contractVersion: 1 as const, version: 1, recordEditing: true }

