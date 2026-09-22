import type { Field, RecordData } from './definition'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type ViewAggregates = {
  count: number
  status: { value: string; count: number }[]
  sums: { field: string; label: string; total: number }[]
  trend: { thisWeek: number; priorWeek: number }
}

function createdAt(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

/** Honest overview numbers from already-loaded records. Counts, status, integer sums, and $createdAt trend only. */
export function viewAggregates(
  records: { createdAt: string; data: RecordData }[],
  fields: Record<string, Field>,
  now = Date.now(),
): ViewAggregates {
  const options = fields.status?.type === 'enum' ? fields.status.options ?? [] : []
  const counts = new Map<string, number>(options.map(value => [value, 0]))
  const sums = Object.entries(fields).flatMap(([field, spec]) => {
    if (spec.type !== 'integer' || spec.reference) return []
    return [{ field, label: spec.label, total: 0 }]
  })
  let thisWeek = 0
  let priorWeek = 0
  const priorStart = now - 2 * WEEK_MS
  const thisStart = now - WEEK_MS
  for (const record of records) {
    const status = typeof record.data.status === 'string' ? record.data.status : undefined
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1)
    for (const sum of sums) {
      const value = record.data[sum.field]
      if (typeof value === 'number') sum.total += value
    }
    const created = createdAt(record.createdAt)
    if (created === undefined) continue
    if (created >= thisStart && created <= now) thisWeek += 1
    else if (created >= priorStart && created < thisStart) priorWeek += 1
  }
  return {
    count: records.length,
    status: [...counts.entries()].map(([value, count]) => ({ value, count })),
    sums,
    trend: { thisWeek, priorWeek },
  }
}
