import { evaluate, type Definition } from '@/kernel/definition'
import type { BusinessRecord, CapabilitySnapshot, Proposal, Snapshot } from '@/lib/client'

export function statusVariant(status: string) {
  const value = status.toLowerCase()
  if (value === 'open') return 'primary' as const
  if (value === 'approved' || value === 'applied' || value === 'published' || value === 'converted' || value === 'confirmed' || value === 'invoiced' || value === 'resolved' || value === 'done' || value === 'assigned' || value === 'active' || value === 'closed' || value === 'completed' || value === 'posted') return 'success' as const
  if (value === 'submitted' || value === 'pending' || value === 'staged' || value === 'draft' || value === 'quoted' || value === 'demo' || value === 'waiting' || value === 'at_risk' || value === 'in_stock' || value === 'on_leave' || value === 'remediating' || value === 'started' || value === 'backlog' || value === 'planned') return 'warning' as const
  if (value === 'declined' || value === 'rejected' || value === 'blocked' || value === 'conflict' || value === 'lost' || value === 'retired' || value === 'offboarded' || value === 'waived' || value === 'canceled' || value === 'revoked' || value === 'failed') return 'danger' as const
  return 'neutral' as const
}

export function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function severityVariant(severity: string) {
  if (severity === 'Critical' || severity === 'High') return 'danger' as const
  if (severity === 'Medium') return 'warning' as const
  if (severity === 'Low') return 'success' as const
  return 'neutral' as const
}

export function isOverdue(data: { status?: unknown; due?: unknown }) {
  const status = String(data.status ?? '')
  if (status === 'closed' || status === 'waived' || status === 'draft') return false
  const due = String(data.due ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false
  return due < new Date().toISOString().slice(0, 10)
}

export function fieldLabel(key: string, label: string) {
  if (key === 'amountCents') return 'Amount'
  if (key === 'confidence') return 'Confidence'
  if (key === 'due') return 'Target date'
  return label
}

export function previewInput(definition: Definition, actionName: string) {
  const action = definition.actions.find(item => item.name === actionName)
  const input: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(action?.input ?? {})) {
    if (field.type === 'integer') input[key] = field.min ?? 1
    else if (field.type === 'boolean') input[key] = Boolean(field.default)
    else if (field.type === 'enum') input[key] = field.options?.[0] ?? ''
    else input[key] = 'Preview reason for availability.'
  }
  return input
}

export function actionPreview(definition: Definition, record: BusinessRecord, actionName: string, role: string) {
  try {
    return evaluate(definition, actionName, record.data, previewInput(definition, actionName), role)
  } catch {
    return null
  }
}

export function actionAvailable(definition: Definition, record: BusinessRecord, actionName: string, role: string) {
  const preview = actionPreview(definition, record, actionName, role)
  if (!preview) return false
  const permission = preview.checks.find(check => check.id === 'permission')
  const state = preview.checks.find(check => check.id === 'state')
  return permission?.passed !== false && (state ? state.passed : true)
}

export function capabilityOf(snapshot: Snapshot, slug: string): CapabilitySnapshot | undefined {
  return snapshot.capabilities.find(item => item.slug === slug) ?? (snapshot.capability.definition.slug === slug ? snapshot.capability : undefined)
}

export function pendingFor(snapshot: Snapshot, recordId: string): Proposal | undefined {
  return snapshot.changes.find(change => change.recordId === recordId && change.status === 'pending')
}

export function chooseSimulation(snapshot: Snapshot) {
  for (const capability of snapshot.capabilities) {
    const records = snapshot.records.filter(item => item.capability === capability.slug)
    for (const record of records) {
      for (const action of capability.definition.actions) {
        const input = previewInput(capability.definition, action.name)
        const preview = actionPreview(capability.definition, record, action.name, snapshot.principal.role)
        if (preview?.allowed) return { record, action: action.name, input }
      }
    }
  }
  return null
}

export function idempotencyKey(store: Map<string, string>, key: string) {
  const existing = store.get(key)
  if (existing) return existing
  const next = `ui-${crypto.randomUUID()}`
  store.set(key, next)
  return next
}
