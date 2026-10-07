import { z } from 'zod'
import type { RecordLayout } from './application-layouts'
import type { Definition, Field, RecordData } from './definition'
import { workingGrammars } from './grammars'
import { inferNavigationIcon, navigationIcons } from './navigation-icons'

const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
export const savedViewSchema = z.object({
  id, name: z.string().trim().min(2).max(60), entity: id,
  grammar: z.enum(workingGrammars).optional(),
  timeZone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, 'Choose a valid IANA timezone.').optional(),
  filters: z.array(z.object({ field: z.string().min(1).max(50), operator: z.enum(['eq', 'neq', 'lte', 'gte', 'is_me', 'empty', 'date_on', 'date_before']), value: z.union([z.string().max(500), z.number().finite(), z.boolean()]) }).strict()).max(6).default([]),
  sort: z.object({ field: z.string().min(1).max(50), direction: z.enum(['asc', 'desc']) }).strict().default({ field: '$createdAt', direction: 'desc' }),
  columns: z.array(z.string().min(1).max(50)).max(8).default([]),
}).strict()
export const navigationItemSchema = z.object({ entity: id, label: z.string().trim().min(2).max(60), icon: z.enum(navigationIcons).optional() }).strict()
export type SavedView = z.infer<typeof savedViewSchema>
export type NavigationItem = z.infer<typeof navigationItemSchema>
export type ApplicationPresentation = { layouts: RecordLayout[]; views: SavedView[]; navigation: NavigationItem[]; startView: string | null }
export function applicationPresentation(app: { entities: Definition[]; layouts?: RecordLayout[]; views?: SavedView[]; navigation?: NavigationItem[]; startView?: string | null }): ApplicationPresentation {
  const navigation: NavigationItem[] = app.navigation?.length ? app.navigation : app.entities.map(e => ({ entity: e.slug, label: e.entity.label.endsWith('s') ? e.entity.label : `${e.entity.label}s` }))
  return { layouts: app.layouts ?? [], views: app.views ?? [], navigation: navigation.map(item => ({ ...item, icon: item.icon ?? inferNavigationIcon(app.entities.find(entity => entity.slug === item.entity)) })), startView: app.startView ?? null }
}
export type ViewContext = { userId?: string; now?: Date; updatedAt?: string | Date }
export function calendarDate(value: Date | string, timeZone = 'UTC') {
  const date = typeof value === 'string' ? new Date(value) : value
  if (!Number.isFinite(date.getTime())) return ''
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }) } catch { return '' }
  const parts = formatter.formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}
export function relativeDate(offset: number, timeZone = 'UTC', now = new Date()) {
  const today = calendarDate(now, timeZone)
  if (!today) return ''
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
export function matchesView(data: RecordData, view?: SavedView, context: ViewContext = {}) {
  return !view || view.filters.every(filter => {
    const value = filter.field === '$updatedAt' ? context.updatedAt && calendarDate(context.updatedAt, view.timeZone) : data[filter.field]
    if (filter.operator === 'is_me') return Boolean(context.userId) && value === context.userId
    if (filter.operator === 'empty') return value === undefined || value === ''
    if (filter.operator === 'eq') return value === filter.value
    if (filter.operator === 'neq') return value !== filter.value
    if (filter.operator === 'date_on' || filter.operator === 'date_before') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const boundary = relativeDate(Number(filter.value), view.timeZone, context.now)
      if (!boundary) return false
      return filter.operator === 'date_on' ? value === boundary : value < boundary
    }
    return typeof value === 'number' && typeof filter.value === 'number' && (filter.operator === 'lte' ? value <= filter.value : value >= filter.value)
  })
}
export function describeViewFilter(filter: SavedView['filters'][number], fields: Record<string, Field>) {
  const label = filter.field === '$updatedAt' ? 'Last updated' : fields[filter.field]?.label ?? filter.field
  if (filter.operator === 'is_me') return `${label} is the current user`
  if (filter.operator === 'empty') return `${label} is empty`
  if (filter.operator === 'date_on' || filter.operator === 'date_before') return `${label} ${filter.operator === 'date_on' ? 'on' : 'before'} today ${Number(filter.value) < 0 ? 'minus' : 'plus'} ${Math.abs(Number(filter.value))} days`
  return `${label} ${{ eq: 'equals', neq: 'does not equal', lte: 'at most', gte: 'at least' }[filter.operator]} ${String(filter.value)}`
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
