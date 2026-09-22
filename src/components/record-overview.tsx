import { Cell, Pie, PieChart } from 'recharts'
import { viewAggregates } from '@/kernel/aggregates'
import type { Definition, RecordData } from '@/kernel/definition'
import { money } from '@/lib/client'
import { statusLabel } from '@/lib/project-ui'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart'

const palette = ['var(--color-cobalt)', 'var(--color-amber)', 'var(--color-success)', 'var(--color-danger)', 'var(--color-quiet)']

export function RecordOverview({
  definition,
  records,
}: {
  definition: Definition
  records: { createdAt: string; data: RecordData }[]
}) {
  const aggregates = viewAggregates(records, definition.entity.fields)
  const noun = definition.entity.label.toLowerCase()
  const nouns = noun.endsWith('s') ? noun : `${noun}s`
  const chartData = aggregates.status.map((item, index) => ({
    key: `s${index}`,
    name: statusLabel(item.value),
    value: item.count,
    fill: palette[index % palette.length],
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
        {aggregates.sums.map(sum => (
          <li key={sum.field}>
            <span>{sum.field.endsWith('Cents') ? 'Total amount' : sum.label}</span>
            <strong>{sum.field.endsWith('Cents') ? money(sum.total) : sum.total.toLocaleString()}</strong>
            <p>Sum of {sum.label.toLowerCase()}</p>
          </li>
        ))}
      </ul>
      <div className="record-chart">
        <h2>Status</h2>
        {aggregates.count === 0 ? <p className="muted">No {nouns} yet. Counts use saved records, not a forecast.</p> : (
          <ChartContainer config={config} className="record-chart-canvas" initialDimension={{ width: 280, height: 220 }}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} stroke="var(--color-surface)" strokeWidth={2}>
                {chartData.map(item => <Cell key={item.key} fill={item.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        {aggregates.count > 0 ? (
          <ul className="record-chart-legend">
            {chartData.map(item => (
              <li key={item.key}><i style={{ background: item.fill }} />{item.name} · {item.value}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
