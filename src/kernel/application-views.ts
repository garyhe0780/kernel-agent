import { z } from 'zod'
import type { RecordLayout } from './application-layouts'
import type { Definition, RecordData } from './definition'

const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
export const savedViewSchema = z.object({
  id, name: z.string().trim().min(2).max(60), entity: id,
  filters: z.array(z.object({ field: z.string().min(1).max(50), operator: z.enum(['eq', 'lte', 'gte']), value: z.union([z.string().max(500), z.number().finite(), z.boolean()]) }).strict()).max(6).default([]),
  sort: z.object({ field: z.string().min(1).max(50), direction: z.enum(['asc', 'desc']) }).strict().default({ field: '$createdAt', direction: 'desc' }),
  columns: z.array(z.string().min(1).max(50)).max(8).default([]),
}).strict()
export const navigationItemSchema = z.object({ entity: id, label: z.string().trim().min(2).max(60) }).strict()
export type SavedView = z.infer<typeof savedViewSchema>
export type NavigationItem = z.infer<typeof navigationItemSchema>
export type ApplicationPresentation = { layouts: RecordLayout[]; views: SavedView[]; navigation: NavigationItem[]; startView: string | null }
export function applicationPresentation(app: { entities: Definition[]; layouts?: RecordLayout[]; views?: SavedView[]; navigation?: NavigationItem[]; startView?: string | null }): ApplicationPresentation {
  return { layouts: app.layouts ?? [], views: app.views ?? [], navigation: app.navigation?.length ? app.navigation : app.entities.map(e => ({ entity: e.slug, label: e.entity.label.endsWith('s') ? e.entity.label : `${e.entity.label}s` })), startView: app.startView ?? null }
}
export function matchesView(data: RecordData, view?: SavedView) {
  return !view || view.filters.every(filter => {
    const value = data[filter.field]
    if (filter.operator === 'eq') return value === filter.value
    return typeof value === 'number' && typeof filter.value === 'number' && (filter.operator === 'lte' ? value <= filter.value : value >= filter.value)
  })
}
export function sortViewRecords<T extends { id: string; createdAt: string; data: RecordData }>(records: T[], sort: SavedView['sort']) {
  const value = (record: T) => sort.field === '$createdAt' ? record.createdAt : record.data[sort.field]
  return [...records].sort((a, b) => {
    const x = value(a), y = value(b)
    // Missing values always sort last, regardless of direction.
    if (x === undefined || x === null || x === '') return y === undefined || y === null || y === '' ? a.id.localeCompare(b.id) : 1
    if (y === undefined || y === null || y === '') return -1
    const comparison = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return (sort.direction === 'asc' ? comparison : -comparison) || a.id.localeCompare(b.id)
  })
}
