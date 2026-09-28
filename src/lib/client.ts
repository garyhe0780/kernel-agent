import { workspaceHeaders } from './workspace-selection'
import type { Check, Definition, Principal, RecordData } from '@/kernel/definition'
import type { Package, PublicBlock } from '@/kernel/packages'
import type { ProjectSnapshot } from '@/kernel/projects'

export type BusinessRecord = { id: string; capability: string; entity: string; data: RecordData; version: number; createdAt: string; updatedAt: string }
export type CapabilitySnapshot = { slug: string; version: number; definition: Definition }
export type Proposal = { executionMode?: 'review' | 'automatic'; kind?: 'action' | 'create'; id: string; capability: string; action: string; recordId: string; recordVersion: number; definitionVersion: number; before: RecordData; after: RecordData; checks: Check[]; status: string; actorKind: string; createdAt: string; proposerName?: string; input?: RecordData }
export type { ProjectSnapshot }
export type Snapshot = {
  model?: { configured: boolean }
  workspace: { id: string; name: string }
  principal: Principal
  project?: ProjectSnapshot
  projects: ProjectSnapshot[]
  capability: CapabilitySnapshot
  capabilities: CapabilitySnapshot[]
  catalog: Package[]
  records: BusinessRecord[]
  changes: Proposal[]
  executions: { id: string; action: string; outcome: string; actorName: string; actorKind: string; details: Record<string, unknown>; createdAt: string; recordId?: string | null }[]
  tools: unknown[]
}
export type PublicSitePayload = {
  workspace: { id: string; name: string }
  example: boolean
  blocks: PublicBlock[]
}
export type ActionResult = { status?: string; checks?: Check[]; change?: Proposal | null }

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', headers: { ...workspaceHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The request could not complete.')
  return result
}

export const money = (cents: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(cents) / 100)
export const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
export const shortId = (value: string) => value.slice(-6).toUpperCase()
