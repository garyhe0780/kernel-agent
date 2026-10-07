import { Fragment } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { viewAggregates } from '@/kernel/aggregates'
import type { Definition, RecordData } from '@/kernel/definition'
import { money } from '@/lib/client'
import { pluralLabel, statusLabel, statusVariant } from '@/lib/project-ui'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart'

const outcomeColors = { success: 'var(--color-success)', danger: 'var(--color-danger)', warning: 'var(--color-amber)' } as const

function statusColors(values: string[]) {
  let progress = 0
  return values.map(value => {
    const variant = statusVariant(value)
    if (variant in outcomeColors) return outcomeColors[variant as keyof typeof outcomeColors]
    return `color-mix(in srgb, var(--color-cobalt) ${Math.max(35, 100 - 13 * progress++)}%, var(--color-surface))`
  })
}

export function RecordOverview({
  definition,
  records,
}: {
  definition: Definition
  records: { createdAt: string; data: RecordData }[]
}) {
  const aggregates = viewAggregates(records, definition.entity.fields)
  const noun = definition.entity.label.toLowerCase()
  const nouns = pluralLabel(noun)
  const amountKey = aggregates.sums.find(sum => sum.field.endsWith('Cents'))?.field
  const colors = statusColors(aggregates.status.map(item => item.value))
  const chartData = aggregates.status.map((item, index) => ({
    key: `s${index}`,
    name: statusLabel(item.value),
    value: item.count,
    amount: amountKey ? records.reduce((sum, record) => sum + (record.data.status === item.value && typeof record.data[amountKey] === 'number' ? record.data[amountKey] as number : 0), 0) : undefined,
    fill: colors[index],
  }))
  const config = Object.fromEntries(chartData.map(item => [item.key, { label: item.name, color: item.fill }])) as ChartConfig
  return (
    <div className="record-overview" role="region" aria-label={`${definition.entity.label} overview`}>
      <ul className="record-stats">
        <li>
          <span>Records</span>
          <strong>{aggregates.count}</strong>
          <p>{aggregates.count === 1 ? noun : nouns} in this view</p>
        </li>
        <li>
          <span>Created this week</span>
          <strong>{aggregates.trend.thisWeek}</strong>
          <p>{aggregates.trend.priorWeek} in the prior 7 days</p>
        </li>
        {aggregates.sums.map(sum => {
          const cents = sum.field.endsWith('Cents')
          const value = sum.open ?? sum.total
          const label = cents ? 'amount' : sum.label.toLowerCase()
          return (
            <Fragment key={sum.field}>
              <li>
                <span>{sum.open === undefined ? (cents ? 'Total amount' : sum.label) : `Open ${label}`}</span>
                <strong>{cents ? money(value) : value.toLocaleString()}</strong>
                <p>{sum.open === undefined ? 'Across every status in this view, including closed ones.' : `Excludes ${aggregates.closed.map(statusLabel).join(' and ')}.`}{cents ? ' Amounts by status are listed below.' : ''}</p>
              </li>
              {sum.weighted === undefined ? null : (
                <li>
                  <span>Weighted {label}</span>
                  <strong>{cents ? money(sum.weighted) : sum.weighted.toLocaleString()}</strong>
                  <p>Open {label} multiplied by each record’s {aggregates.weight?.toLowerCase()}.</p>
                </li>
              )}
            </Fragment>
          )
        })}
      </ul>
      <div className="record-chart">
        <h2>Status</h2>
        {aggregates.count === 0 ? <p className="muted">No {nouns} yet. Counts use saved records, not a forecast.</p> : (
          <ChartContainer config={config} className="record-chart-canvas" role="img" aria-label={`${aggregates.count} ${nouns} by status. ${chartData.filter(item => item.value).map(item => `${item.name}: ${item.value}`).join('. ')}.`} initialDimension={{ width: 280, height: 220 }}>
            <PieChart accessibilityLayer={false}>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie isAnimationActive={false} data={chartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} stroke="var(--color-surface)" strokeWidth={2}>
                {chartData.map(item => <Cell key={item.key} fill={item.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        {aggregates.count > 0 ? (
          <ul className="record-chart-legend">
            {chartData.map(item => (
              <li key={item.key}><i aria-hidden="true" style={{ background: item.fill }} /><span>{item.name} · {item.value}{item.amount !== undefined && item.value ? ` · ${money(item.amount)}` : ''}</span></li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
