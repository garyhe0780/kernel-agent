import { toast } from 'sonner'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  FolderKanban,
  Headphones,
  Layers,
  Menu,
  Search,
  ShoppingBag,
  ListOrdered,
  Users,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge, Empty, ToggleGroup } from '@/components/ui/surfaces'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { DashboardOrders } from '@/components/dashboard-orders'

type Page =
  | 'analytics'
  | 'sales'
  | 'commerce'
  | 'finance'
  | 'projects'
  | 'support'
  | 'orders'
const pages = [
  {
    id: 'analytics',
    name: 'Analytics',
    icon: BarChart3,
    title: 'A little perspective. A clearer picture.',
    subtitle: 'Understand how people find you, explore, and come back.',
    kind: 'Website analytics',
  },
  {
    id: 'sales',
    name: 'Sales CRM',
    icon: Users,
    title: 'Good relationships. Great momentum.',
    subtitle: 'Your pipeline, from the first conversation to the next big win.',
    kind: 'Sales pipeline',
  },
  {
    id: 'commerce',
    name: 'Commerce',
    icon: ShoppingBag,
    title: 'Every order, taken care of.',
    subtitle: 'A clear view of your store, from checkout to doorstep.',
    kind: 'Store overview',
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: CreditCard,
    title: 'Know where your money is going.',
    subtitle: 'Cash flow, spending, and the details that keep things balanced.',
    kind: 'Finance overview',
  },
  {
    id: 'projects',
    name: 'Projects',
    icon: FolderKanban,
    title: 'Make room for your best work.',
    subtitle: 'Keep the team aligned and move the important things forward.',
    kind: 'Project workspace',
  },
  {
    id: 'support',
    name: 'Support',
    icon: Headphones,
    title: 'A better day for your customers.',
    subtitle: 'Bring every conversation into focus. Make every reply count.',
    kind: 'Support inbox',
  },
  {
    id: 'orders',
    name: 'Orders',
    icon: ListOrdered,
    title: 'Orders',
    subtitle: 'Manage, track, and fulfill your customer orders.',
    kind: 'Orders',
  },
] as const
const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('dg-section', className)}>
      <header className="dg-section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
function Metric({
  label,
  value,
  change,
  note = 'vs. previous period',
}: {
  label: string
  value: string
  change: string
  note?: string
}) {
  return (
    <div className="dg-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <div>
        <span className="dg-positive">{change}</span>
        <small>{note}</small>
      </div>
    </div>
  )
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <InputGroup className="dg-search">
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputGroup>
  )
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="dg-avatar" aria-label={name}>
      {name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')}
    </span>
  )
}
function exportCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','),
    )
    .join('\r\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-sample.csv`
  link.click()
  URL.revokeObjectURL(url)
}
const traffic = [
  620, 720, 670, 950, 790, 840, 660, 1010, 870, 1130, 1020, 900, 1160, 1080,
  810, 930, 1180, 1030, 1250, 970, 1080, 1370, 1150, 1280, 1480, 1290, 1390,
  1320, 1510, 1470,
]
const webPages = [
  ['/', 'Homepage', 18420, '42.8%', '+18.6%'],
  ['/products', 'Product collection', 11380, '26.4%', '+12.3%'],
  ['/journal', 'Stories & ideas', 6420, '14.9%', '+24.1%'],
  ['/about', 'About the studio', 4180, '9.7%', '+8.2%'],
  ['/contact', 'Get in touch', 2670, '6.2%', '+6.4%'],
] as const
function Analytics({ notify }: { notify: (s: string) => void }) {
  const [range, setRange] = useState('30')
  const [metric, setMetric] = useState('visitors')
  const days = Number(range)
  const factor = metric === 'visitors' ? 1 : 2.35
  const chart = traffic.slice(-days).map((n, i) => ({
    day: `Sep ${31 - days + i}`,
    current: Math.round(n * factor),
    previous: Math.round((n * 0.69 + Math.sin(i * 2) * 100) * factor),
  }))
  const total = chart.reduce((sum, row) => sum + row.current, 0)
  const previousTotal = chart.reduce((sum, row) => sum + row.previous, 0)
  const growth = `+${((total / previousTotal - 1) * 100).toFixed(1)}%`
  const visitorTotal = traffic.slice(-days).reduce((sum, n) => sum + n, 0)
  return (
    <>
      <div className="dg-toolbar">
        <ToggleGroup
          label="Analytics metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'visitors', label: 'Visitors' },
            { value: 'views', label: 'Page views' },
          ]}
        />
        <div className="dg-actions">
          <select
            aria-label="Analytics date range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="30">Sep 1 – 30, 2026</option>
            <option value="7">Sep 24 – 30, 2026</option>
          </select>
          <Button
            variant="outline"
            onPress={() => {
              exportCsv('analytics', [
                ['Date', metric, 'Previous period'],
                ...chart.map((r) => [r.day, r.current, r.previous]),
              ])
              notify('Analytics report exported')
            }}
          >
            <Download data-icon="inline-start" />
            Export
          </Button>
        </div>
      </div>
      <div className="dg-metrics">
        <Metric
          label={metric === 'visitors' ? 'Unique visitors' : 'Page views'}
          value={total.toLocaleString()}
          change={growth}
        />
        <Metric label="Conversion rate" value="4.82%" change="+0.8%" />
        <Metric label="Average visit" value="3m 42s" change="+12.4%" />
        <Metric label="Bounce rate" value="32.6%" change="−4.2%" />
      </div>
      <div className="dg-analytics-grid">
        <Section
          title="Audience overview"
          aside={
            <span className="dg-legend">
              <i />
              This period <i className="previous" />
              Previous period
            </span>
          }
        >
          <div className="dg-chart-summary">
            <strong>{total.toLocaleString()}</strong>
            <Badge variant="success">{growth}</Badge>
            <span>
              {metric === 'visitors' ? 'visitors' : 'page views'} over {days}{' '}
              days
            </span>
          </div>
          <ChartContainer
            className="dg-chart"
            aria-label="Audience overview. Use left and right arrow keys to inspect daily values."
            config={{
              current: { label: 'This period', color: '#3659d9' },
              previous: { label: 'Previous period', color: '#adb7cb' },
            }}
          >
            <AreaChart
              data={chart}
              margin={{ top: 12, right: 10, left: -12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 4" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                minTickGap={65}
                tick={{ fill: '#626b78', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#626b78', fontSize: 11 }}
              />
              <Tooltip
                content={<ChartTooltipContent className="dg-chart-tooltip" />}
                cursor={{ stroke: '#c9d1e2', strokeWidth: 1, strokeDasharray: '3 4' }}
              />
              <Area
                type="monotone"
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                dataKey="previous"
                name="Previous period"
                stroke="#adb7cb"
                fill="transparent"
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                dataKey="current"
                name="This period"
                stroke="#3659d9"
                fill="#edf2ff"
                strokeWidth={2.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </Section>
        <Section
          title="Traffic sources"
          aside={<span className="dg-muted">By channel</span>}
        >
          <p className="dg-section-description">
            Visitors by channel · selected {days} days
          </p>
          <div
            className="dg-channel-stack"
            aria-label="Traffic shares: Direct 42%, Organic search 28%, Social 18%, Referrals 12%"
          >
            <i style={{ flex: 42 }} />
            <i style={{ flex: 28 }} />
            <i style={{ flex: 18 }} />
            <i style={{ flex: 12 }} />
          </div>
          {[
            ['Direct', '42%', Math.round(visitorTotal * 0.42).toLocaleString()],
            [
              'Organic search',
              '28%',
              Math.round(visitorTotal * 0.28).toLocaleString(),
            ],
            ['Social', '18%', Math.round(visitorTotal * 0.18).toLocaleString()],
            [
              'Referrals',
              '12%',
              (
                visitorTotal -
                Math.round(visitorTotal * 0.42) -
                Math.round(visitorTotal * 0.28) -
                Math.round(visitorTotal * 0.18)
              ).toLocaleString(),
            ],
          ].map(([name, pct, count], i) => (
            <div className="dg-channel" key={name}>
              <span>
                <i className={`dg-dot dg-channel-${i}`} />
                {name}
              </span>
              <span>
                {pct}
                <small>{count}</small>
              </span>
            </div>
          ))}
          <div className="dg-insight">
            <ArrowUpRight />
            <p>
              <strong>Organic is growing.</strong>
              <br />
              Search brought in 22% more visitors than the previous period.
            </p>
          </div>
        </Section>
      </div>
      <div className="dg-bottom-grid">
        <Section
          title="Top pages"
          aside={
            <span className="dg-muted">By unique visitors · September</span>
          }
        >
          <div className="dg-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Visitors</th>
                  <th>Share</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {webPages.map(([path, label, count, share, trend]) => (
                  <tr key={path}>
                    <td>
                      <strong>{path}</strong>
                      <small>{label}</small>
                    </td>
                    <td>{count.toLocaleString()}</td>
                    <td>{share}</td>
                    <td className="dg-positive">{trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Devices">
          <div className="dg-device-number">
            68.4%<small>of visitors browse on desktop</small>
          </div>
          {[
            ['Desktop', 68.4],
            ['Mobile', 26.8],
            ['Tablet', 4.8],
          ].map(([name, percent]) => (
            <div className="dg-device" key={name}>
              <div>
                <span>{name}</span>
                <strong>{percent}%</strong>
              </div>
              <div className="dg-track">
                <i style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
        </Section>
      </div>
    </>
  )
}
const initialDeals = [
  {
    name: 'Linear',
    detail: 'Enterprise workspace',
    value: 24000,
    owner: 'Alex Morgan',
    stage: 'Qualified',
    tag: 'Software',
    date: 'Oct 04',
  },
  {
    name: 'Acme Studio',
    detail: 'Annual team plan',
    value: 12800,
    owner: 'Jamie Chen',
    stage: 'Qualified',
    tag: 'Design',
    date: 'Oct 08',
  },
  {
    name: 'Orbit',
    detail: 'Platform expansion',
    value: 36000,
    owner: 'Sam Rivera',
    stage: 'Proposal',
    tag: 'Technology',
    date: 'Oct 02',
  },
  {
    name: 'Northstar',
    detail: 'Operations rollout',
    value: 18500,
    owner: 'Alex Morgan',
    stage: 'Proposal',
    tag: 'Consulting',
    date: 'Oct 06',
  },
  {
    name: 'Layers',
    detail: 'Company-wide license',
    value: 48000,
    owner: 'Jamie Chen',
    stage: 'Negotiation',
    tag: 'Software',
    date: 'Sep 30',
  },
  {
    name: 'Sonder',
    detail: 'Growth partnership',
    value: 22000,
    owner: 'Sam Rivera',
    stage: 'Negotiation',
    tag: 'Commerce',
    date: 'Oct 01',
  },
  {
    name: 'Capsule',
    detail: 'Enterprise onboarding',
    value: 32000,
    owner: 'Alex Morgan',
    stage: 'Won',
    tag: 'Technology',
    date: 'Sep 26',
  },
]
function Sales() {
  const [deals, setDeals] = useState(initialDeals)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('board')
  const [selected, setSelected] = useState<string | null>(null)
  const filtered = deals.filter((d) =>
    `${d.name} ${d.owner}`.toLowerCase().includes(query.toLowerCase()),
  )
  const deal = deals.find((d) => d.name === selected)
  return (
    <>
      <div className="dg-metrics">
        <Metric
          label="Open pipeline"
          value={money(
            deals
              .filter((d) => d.stage !== 'Won')
              .reduce((s, d) => s + d.value, 0),
          )}
          change="+16.2%"
        />
        <Metric
          label="Won revenue"
          value={money(
            deals
              .filter((d) => d.stage === 'Won')
              .reduce((s, d) => s + d.value, 0),
          )}
          change="+24.8%"
        />
        <Metric label="Win rate" value="32.8%" change="+4.1%" />
        <Metric label="Average sales cycle" value="18 days" change="−3 days" />
      </div>
      <div className="dg-toolbar">
        <ToggleGroup
          label="Pipeline view"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: 'Pipeline' },
            { value: 'list', label: 'All deals' },
          ]}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search companies or owners"
        />
      </div>
      {filtered.length === 0 ? (
        <Empty title="No matching deals">Try another company or owner.</Empty>
      ) : view === 'board' ? (
        <div className="dg-pipeline">
          {['Qualified', 'Proposal', 'Negotiation', 'Won'].map(
            (stage, index) => (
              <section className="dg-stage" key={stage}>
                <header>
                  <span>
                    <i className={`dg-stage-dot stage-${index}`} />
                    {stage}
                    <small>
                      {filtered.filter((d) => d.stage === stage).length}
                    </small>
                  </span>
                  <strong>
                    {money(
                      filtered
                        .filter((d) => d.stage === stage)
                        .reduce((s, d) => s + d.value, 0),
                    )}
                  </strong>
                </header>
                {filtered
                  .filter((d) => d.stage === stage)
                  .map((d) => (
                    <button
                      className="dg-deal"
                      key={d.name}
                      onClick={() => setSelected(d.name)}
                    >
                      <div className="dg-company">
                        <Avatar name={d.name} />
                        <strong>{d.name}</strong>
                        <ChevronRight />
                      </div>
                      <p>{d.detail}</p>
                      <h3>
                        {money(d.value)}
                        <span> / year</span>
                      </h3>
                      <Badge>{d.tag}</Badge>
                      <footer>
                        <span>
                          <Avatar name={d.owner} />
                          {d.owner.split(' ')[0]}
                        </span>
                        <span>{d.date}</span>
                      </footer>
                    </button>
                  ))}
                {!filtered.some((d) => d.stage === stage) && (
                  <p className="dg-column-empty">No deals in this stage</p>
                )}
              </section>
            ),
          )}
        </div>
      ) : (
        <Section title="All opportunities">
          <div className="dg-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Owner</th>
                  <th>Value</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.name}>
                    <td>
                      <button
                        className="dg-text-button"
                        onClick={() => setSelected(d.name)}
                      >
                        {d.name}
                      </button>
                      <small>{d.detail}</small>
                    </td>
                    <td>{d.owner}</td>
                    <td>{money(d.value)}</td>
                    <td>
                      <Badge
                        variant={d.stage === 'Won' ? 'success' : 'neutral'}
                      >
                        {d.stage}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {deal && (
        <section className="dg-inline-detail" aria-label="Deal details">
          <header>
            <div>
              <h2>{deal.name}</h2>
              <p>
                {deal.detail} · {money(deal.value)} annual value
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close deal details"
              onPress={() => setSelected(null)}
            >
              <X />
            </Button>
          </header>
          <label>
            Pipeline stage
            <select
              value={deal.stage}
              onChange={(e) =>
                setDeals((rows) =>
                  rows.map((row) =>
                    row.name === deal.name
                      ? { ...row, stage: e.target.value }
                      : row,
                  ),
                )
              }
            >
              {['Qualified', 'Proposal', 'Negotiation', 'Won'].map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <p>
            Owner: {deal.owner} · Expected close: {deal.date}, 2026
          </p>
        </section>
      )}
      <div className="dg-note">
        <CheckCheck />
        <span>
          Good conversations build great companies. Select a deal to update its
          stage.
        </span>
      </div>
    </>
  )
}
const ordersSeed = [
  {
    id: '#1048',
    name: 'Olivia Rhye',
    item: 'Everyday tote',
    total: 84,
    status: 'Unfulfilled',
    payment: 'Paid',
    date: 'Today, 10:42',
  },
  {
    id: '#1047',
    name: 'Phoenix Baker',
    item: 'Studio notebook · 2 items',
    total: 56,
    status: 'Unfulfilled',
    payment: 'Paid',
    date: 'Today, 10:18',
  },
  {
    id: '#1046',
    name: 'Lana Steiner',
    item: 'Desk essentials set',
    total: 128,
    status: 'Shipped',
    payment: 'Paid',
    date: 'Today, 09:56',
  },
  {
    id: '#1045',
    name: 'Demi Wilkinson',
    item: 'Ceramic mug · 3 items',
    total: 96,
    status: 'Shipped',
    payment: 'Paid',
    date: 'Today, 09:31',
  },
  {
    id: '#1044',
    name: 'Drew Cano',
    item: 'Everyday tote',
    total: 84,
    status: 'Unfulfilled',
    payment: 'Pending',
    date: 'Yesterday',
  },
  {
    id: '#1043',
    name: 'Natali Craig',
    item: 'Linen journal',
    total: 32,
    status: 'Delivered',
    payment: 'Paid',
    date: 'Yesterday',
  },
]
function Commerce({ notify }: { notify: (s: string) => void }) {
  const [orders, setOrders] = useState(ordersSeed)
  const [status, setStatus] = useState('All orders')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const rows = orders.filter(
    (o) =>
      (status === 'All orders' || o.status === status) &&
      `${o.id} ${o.name} ${o.item}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <div className="dg-metrics">
        <Metric label="Total sales" value="$24,680" change="+12.8%" />
        <Metric label="Orders" value="284" change="+8.4%" />
        <Metric label="Average order value" value="$86.90" change="+4.1%" />
        <Metric label="Returning customers" value="28.4%" change="+2.6%" />
      </div>
      <div className="dg-commerce-layout">
        <div>
          <Section
            title="Orders"
            aside={<Badge>{orders.length} recent orders</Badge>}
          >
            <div className="dg-toolbar dg-inset">
              <ToggleGroup
                label="Order status"
                value={status}
                onChange={setStatus}
                options={['All orders', 'Unfulfilled', 'Shipped'].map((s) => ({
                  value: s,
                  label: s,
                }))}
              />
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search orders"
              />
            </div>
            {selected.length > 0 && (
              <div className="dg-selection">
                <span>{selected.length} selected</span>
                <Button
                  variant="primary"
                  onPress={() => {
                    const count = orders.filter(
                      (o) => selected.includes(o.id) && o.payment === 'Paid',
                    ).length
                    setOrders((old) =>
                      old.map((o) =>
                        selected.includes(o.id) && o.payment === 'Paid'
                          ? { ...o, status: 'Shipped' }
                          : o,
                      ),
                    )
                    setSelected([])
                    notify(
                      `${count} paid orders marked shipped. Pending payments stay unfulfilled.`,
                    )
                  }}
                >
                  Mark paid orders shipped
                </Button>
                <Button variant="ghost" onPress={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            )}
            <div className="dg-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Select order</span>
                    </th>
                    <th>Order / customer</th>
                    <th>Payment</th>
                    <th>Fulfillment</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <input
                          aria-label={`Select order ${o.id}`}
                          type="checkbox"
                          checked={selected.includes(o.id)}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, o.id]
                                : s.filter((id) => id !== o.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          {o.id}
                          <span className="dg-customer">{o.name}</span>
                        </strong>
                        <small>{o.item}</small>
                      </td>
                      <td>
                        <Badge
                          variant={o.payment === 'Paid' ? 'success' : 'warning'}
                        >
                          {o.payment}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            o.status === 'Unfulfilled'
                              ? 'warning'
                              : o.status === 'Delivered'
                                ? 'success'
                                : 'primary'
                          }
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td>{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <Empty title="No matching orders">
                Try a different name or fulfillment filter.
              </Empty>
            )}
            <footer className="dg-table-footer">
              Showing {rows.length} recent orders{' '}
              <span>Sample store · USD</span>
            </footer>
          </Section>
        </div>
        <div className="dg-side-stack">
          <Section title="Bestsellers">
            {[
              ['Everyday tote', '86 sold', '$7,224', 'ET'],
              ['Desk essentials', '42 sold', '$5,376', 'DE'],
              ['Ceramic mug', '68 sold', '$2,176', 'CM'],
            ].map(([name, sold, total, initials], i) => (
              <div className="dg-product" key={name}>
                <span className={`dg-product-art product-${i}`}>
                  {initials}
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{sold}</small>
                </div>
                <span>{total}</span>
              </div>
            ))}
          </Section>
          <Section title="Fulfillment checklist">
            <div className="dg-checklist">
              <p>
                <ShoppingBag />
                <span>
                  <strong>
                    {orders.filter((o) => o.status === 'Unfulfilled').length}{' '}
                    orders to prepare
                  </strong>
                  <small>Review payment before shipping</small>
                </span>
              </p>
              <p>
                <CheckCheck />
                <span>
                  <strong>
                    {orders.filter((o) => o.status === 'Shipped').length} on
                    their way
                  </strong>
                  <small>Tracking shared with customers</small>
                </span>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </>
  )
}
const transactions = [
  ['Figma', 'Software', 'Sep 27', -144, 'Completed'],
  ['Acme Studio', 'Client payment', 'Sep 26', 8400, 'Completed'],
  ['Notion', 'Software', 'Sep 25', -96, 'Completed'],
  ['Studio rent', 'Office', 'Sep 25', -2400, 'Completed'],
  ['Linear', 'Client payment', 'Sep 24', 6200, 'Completed'],
  ['Team workshop', 'Team', 'Sep 23', -680, 'Pending'],
] as const
function Finance() {
  const [filter, setFilter] = useState('All transactions')
  const data = [
    { month: 'Apr', income: 22, expenses: 16 },
    { month: 'May', income: 29, expenses: 19 },
    { month: 'Jun', income: 26, expenses: 17 },
    { month: 'Jul', income: 34, expenses: 22 },
    { month: 'Aug', income: 31, expenses: 19 },
    { month: 'Sep', income: 42, expenses: 24 },
  ]
  return (
    <>
      <div className="dg-finance-top">
        <div className="dg-balance">
          <span>Available balance</span>
          <strong>
            $128,450<span>.00</span>
          </strong>
          <p>
            <Badge variant="success">+12.4%</Badge> vs. last month
          </p>
          <footer>
            <span>Operating account</span>
            <span>USD · •••• 4829</span>
          </footer>
        </div>
        <Section
          title="Cash flow"
          aside={
            <span className="dg-legend">
              <i />
              Income <i className="previous" />
              Expenses
            </span>
          }
        >
          <ChartContainer
            className="dg-chart dg-cash-chart"
            aria-label="Cash flow. Use left and right arrow keys to inspect monthly values."
            config={{
              income: { label: 'Income ($k)', color: '#3659d9' },
              expenses: { label: 'Expenses ($k)', color: '#dbe1ef' },
            }}
          >
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 4" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} />
              <YAxis unit="k" axisLine={false} tickLine={false} />
              <Tooltip
                content={<ChartTooltipContent className="dg-chart-tooltip" />}
                cursor={{ fill: '#edf2ff', fillOpacity: 0.55 }}
              />
              <Bar
                dataKey="income"
                name="Income ($k)"
                fill="#3659d9"
                radius={[3, 3, 0, 0]}
                maxBarSize={25}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expenses"
                name="Expenses ($k)"
                fill="#dbe1ef"
                radius={[3, 3, 0, 0]}
                maxBarSize={25}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        </Section>
      </div>
      <div className="dg-bottom-grid">
        <Section
          title="Recent transactions"
          aside={
            <select
              aria-label="Transaction type"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {['All transactions', 'Income', 'Expenses'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          }
        >
          <div className="dg-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions
                  .filter(
                    (t) =>
                      filter === 'All transactions' ||
                      (filter === 'Income' ? t[3] > 0 : t[3] < 0),
                  )
                  .map(([name, cat, date, value, status]) => (
                    <tr key={name}>
                      <td>
                        <div className="dg-transaction">
                          <span
                            className={cn(
                              'dg-transaction-icon',
                              value > 0 && 'is-income',
                            )}
                          >
                            {value > 0 ? <ArrowDownLeft /> : <ArrowUpRight />}
                          </span>
                          <span>
                            <strong>{name}</strong>
                            <small>{cat}</small>
                          </span>
                        </div>
                      </td>
                      <td>{date}</td>
                      <td>
                        <Badge
                          variant={
                            status === 'Completed' ? 'success' : 'warning'
                          }
                        >
                          {status}
                        </Badge>
                      </td>
                      <td className={value > 0 ? 'dg-positive' : ''}>
                        {value > 0 ? '+' : '−'}
                        {money(Math.abs(value))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section
          title="Monthly budgets"
          aside={<span className="dg-muted">September</span>}
        >
          {[
            ['Software', 1240, 1800],
            ['Office', 3200, 4000],
            ['Marketing', 4650, 5000],
            ['Team', 1860, 3000],
          ].map(([name, spent, budget]) => (
            <div className="dg-budget" key={name}>
              <div>
                <strong>{name}</strong>
                <span>
                  {Math.round((Number(spent) / Number(budget)) * 100)}%
                </span>
              </div>
              <div className="dg-track">
                <i
                  className={
                    Number(spent) / Number(budget) > 0.9 ? 'near-limit' : ''
                  }
                  style={{
                    width: `${(Number(spent) / Number(budget)) * 100}%`,
                  }}
                />
              </div>
              <small>
                {money(Number(spent))} of {money(Number(budget))}
              </small>
            </div>
          ))}
        </Section>
      </div>
    </>
  )
}
const tasksSeed = [
  {
    title: 'Map the onboarding journey',
    label: 'Research',
    owner: 'Alex Morgan',
    state: 'Backlog',
    date: 'Oct 02',
    priority: 'Medium',
  },
  {
    title: 'Audit notification preferences',
    label: 'Product',
    owner: 'Sam Rivera',
    state: 'Backlog',
    date: 'Oct 04',
    priority: 'Low',
  },
  {
    title: 'Build the component library',
    label: 'Design',
    owner: 'Jamie Chen',
    state: 'In progress',
    date: 'Sep 30',
    priority: 'High',
  },
  {
    title: 'Implement account settings',
    label: 'Engineering',
    owner: 'Alex Morgan',
    state: 'In progress',
    date: 'Oct 01',
    priority: 'Medium',
  },
  {
    title: 'Review dashboard accessibility',
    label: 'Design',
    owner: 'Sam Rivera',
    state: 'In review',
    date: 'Sep 29',
    priority: 'High',
  },
  {
    title: 'Write the release notes',
    label: 'Product',
    owner: 'Jamie Chen',
    state: 'In review',
    date: 'Sep 30',
    priority: 'Low',
  },
  {
    title: 'Define the product principles',
    label: 'Strategy',
    owner: 'Alex Morgan',
    state: 'Done',
    date: 'Sep 25',
    priority: 'Medium',
  },
  {
    title: 'Set up the project workspace',
    label: 'Engineering',
    owner: 'Sam Rivera',
    state: 'Done',
    date: 'Sep 24',
    priority: 'Low',
  },
]
function Projects() {
  const [tasks, setTasks] = useState(tasksSeed)
  const [filter, setFilter] = useState('Everyone')
  const [view, setView] = useState('board')
  const rows = tasks.filter((t) => filter === 'Everyone' || t.owner === filter)
  const done = tasks.filter((t) => t.state === 'Done').length
  return (
    <>
      <div className="dg-project-banner">
        <div>
          <span className="dg-project-mark">
            <Layers />
          </span>
          <div>
            <h2>Workspace refresh</h2>
            <p>A simpler, more thoughtful way to work.</p>
          </div>
        </div>
        <div className="dg-project-progress">
          <span>
            <strong>
              {done} of {tasks.length} tasks
            </strong>{' '}
            completed
          </span>
          <div className="dg-track">
            <i style={{ width: `${(done / tasks.length) * 100}%` }} />
          </div>
        </div>
        <div>
          <Badge variant="success">On track</Badge>
          <span className="dg-muted">Due Oct 09</span>
        </div>
      </div>
      <div className="dg-toolbar">
        <ToggleGroup
          label="Project view"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: 'Board' },
            { value: 'list', label: 'List' },
          ]}
        />
        <select
          aria-label="Filter tasks by owner"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {['Everyone', 'Alex Morgan', 'Jamie Chen', 'Sam Rivera'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className={cn('dg-task-board', view === 'list' && 'dg-task-list')}>
        {['Backlog', 'In progress', 'In review', 'Done'].map((state, index) => (
          <section className="dg-task-column" key={state}>
            <h2>
              <i className={`dg-stage-dot stage-${index}`} />
              {state}
              <small>{rows.filter((t) => t.state === state).length}</small>
            </h2>
            {rows
              .filter((t) => t.state === state)
              .map((task) => (
                <article className="dg-task" key={task.title}>
                  <div>
                    <Badge>{task.label}</Badge>
                    <span
                      className={cn(
                        'dg-priority',
                        task.priority === 'High' && 'is-high',
                      )}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <footer>
                    <Avatar name={task.owner} />
                    <span>{task.date}</span>
                  </footer>
                  <label className="dg-task-state">
                    <span className="sr-only">Status for {task.title}</span>
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.state}
                      onChange={(e) =>
                        setTasks((old) =>
                          old.map((t) =>
                            t.title === task.title
                              ? { ...t, state: e.target.value }
                              : t,
                          ),
                        )
                      }
                    >
                      {['Backlog', 'In progress', 'In review', 'Done'].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </label>
                </article>
              ))}
            {!rows.some((t) => t.state === state) && (
              <p className="dg-column-empty">No tasks here</p>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
const ticketsSeed = [
  {
    id: 1284,
    name: 'Olivia Rhye',
    subject: 'Can I invite my whole team?',
    text: 'Hi there! We’re moving our team over this week. Is there a way to invite everyone at once, or should I add each person individually?',
    time: '12m',
    status: 'Open',
    topic: 'Getting started',
  },
  {
    id: 1283,
    name: 'Phoenix Baker',
    subject: 'A question about my invoice',
    text: 'Hello! Could you help me find the invoice for our September subscription? I need a copy for our accounting team.',
    time: '28m',
    status: 'Open',
    topic: 'Billing',
  },
  {
    id: 1282,
    name: 'Lana Steiner',
    subject: 'Exporting our project data',
    text: 'We’d love to export our project records for our monthly report. Which formats are available?',
    time: '46m',
    status: 'Open',
    topic: 'Product',
  },
  {
    id: 1281,
    name: 'Drew Cano',
    subject: 'Thank you for the quick help!',
    text: 'That worked perfectly. Thanks so much for walking me through it!',
    time: '1h',
    status: 'Resolved',
    topic: 'Feedback',
  },
]
function Support({ notify }: { notify: (s: string) => void }) {
  const [tickets, setTickets] = useState(ticketsSeed)
  const [active, setActive] = useState(1284)
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [replies, setReplies] = useState<Record<number, string[]>>({})
  const ticket = tickets.find((t) => t.id === active)!
  const rows = tickets.filter(
    (t) =>
      (filter === 'All' || t.status === filter) &&
      `${t.name} ${t.subject}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <div className="dg-support-stats">
        <div>
          <span>Open conversations</span>
          <strong>
            {tickets.filter((t) => t.status === 'Open').length}
            <small>needs a human touch</small>
          </strong>
        </div>
        <div>
          <span>First response</span>
          <strong>
            12m<small className="dg-positive">8m faster this week</small>
          </strong>
        </div>
        <div>
          <span>Customer satisfaction</span>
          <strong>
            98.2%<small className="dg-positive">+2.4% this month</small>
          </strong>
        </div>
      </div>
      <div className="dg-inbox">
        <section className="dg-conversations" aria-label="Conversations">
          <div className="dg-inbox-tools">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search conversations"
            />
            <ToggleGroup
              label="Conversation status"
              value={filter}
              onChange={setFilter}
              options={['All', 'Open', 'Resolved'].map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </div>
          {rows.map((t) => (
            <button
              key={t.id}
              className={cn('dg-ticket', active === t.id && 'is-selected')}
              aria-pressed={active === t.id}
              onClick={() => {
                setActive(t.id)
                setDraft('')
              }}
            >
              <div>
                <Avatar name={t.name} />
                <strong>{t.name}</strong>
                <small>{t.time}</small>
              </div>
              <h3>{t.subject}</h3>
              <p>{t.text}</p>
              <Badge variant={t.status === 'Resolved' ? 'success' : 'neutral'}>
                {t.status === 'Resolved' ? 'Resolved' : t.topic}
              </Badge>
            </button>
          ))}
          {!rows.length && (
            <Empty title="You're all caught up">
              No conversations match this filter.
            </Empty>
          )}
        </section>
        <section className="dg-conversation" aria-label="Selected conversation">
          <header>
            <div>
              <h2>{ticket.subject}</h2>
              <p>
                #{ticket.id} · {ticket.topic}
              </p>
            </div>
            <Button
              variant={ticket.status === 'Resolved' ? 'outline' : 'primary'}
              onPress={() => {
                setTickets((old) =>
                  old.map((t) =>
                    t.id === active
                      ? {
                          ...t,
                          status: t.status === 'Open' ? 'Resolved' : 'Open',
                        }
                      : t,
                  ),
                )
                notify(
                  ticket.status === 'Open'
                    ? 'Conversation resolved'
                    : 'Conversation reopened',
                )
              }}
            >
              <Check data-icon="inline-start" />
              {ticket.status === 'Resolved' ? 'Reopen' : 'Resolve'}
            </Button>
          </header>
          <div className="dg-message-area">
            <span className="dg-date-divider">September 27, 2026</span>
            <div className="dg-message">
              <Avatar name={ticket.name} />
              <div>
                <strong>
                  {ticket.name}
                  <small>10:42 AM</small>
                </strong>
                <p>{ticket.text}</p>
              </div>
            </div>
            {replies[active]?.map((reply, i) => (
              <div className="dg-message dg-reply" key={i}>
                <Avatar name="Alex Morgan" />
                <div>
                  <strong>
                    You<small>Just now · demo reply</small>
                  </strong>
                  <p>{reply}</p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="dg-composer"
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              setReplies((old) => ({
                ...old,
                [active]: [...(old[active] ?? []), draft.trim()],
              }))
              setDraft('')
              notify('Demo reply added. No message was sent externally.')
            }}
          >
            <label htmlFor="dg-reply">
              Reply to {ticket.name.split(' ')[0]}
            </label>
            <textarea
              id="dg-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a thoughtful reply…"
              rows={3}
            />
            <footer>
              <span>Demo conversation · replies stay in this session</span>
              <Button type="submit" disabled={!draft.trim()}>
                Add reply
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </footer>
          </form>
        </section>
      </div>
    </>
  )
}
export function DashboardGallery() {
  const [page, setPage] = useState<Page>('analytics')
  const [menuOpen, setMenuOpen] = useState(false)
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const read = () => {
      const id = window.location.hash.slice(1)
      if (pages.some((p) => p.id === id)) setPage(id as Page)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  const current = pages.find((p) => p.id === page)!
  const Icon = current.icon
  const selectPage = (id: Page) => {
    setPage(id)
    window.history.replaceState(null, '', `#${id}`)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  return (
    <div className="dashboard-gallery">
      <a className="dg-skip" href="#dashboard-main">
        Skip to dashboard
      </a>
      <aside className={cn('dg-sidebar', menuOpen && 'is-open')}>
        <a className="dg-brand" href="/dashboards">
          <span>
            <Layers />
          </span>
          kernel<span className="dg-brand-suffix">/ studio</span>
        </a>
        <div className="dg-workspace">
          <span className="dg-workspace-icon">S</span>
          <div>
            <strong>Studio workspace</strong>
            <small>Dashboard collection</small>
          </div>
          <Badge>Demo</Badge>
        </div>
        <div className="dg-nav-label">Explore dashboards</div>
        <nav aria-label="Dashboard examples">
          {pages.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={p.id === page ? 'page' : undefined}
              className={cn('dg-nav-item', p.id === page && 'is-active')}
              onClick={(e) => {
                e.preventDefault()
                selectPage(p.id)
              }}
            >
              <p.icon />
              <span>{p.name}</span>
              {p.id === page && <ChevronRight />}
            </a>
          ))}
        </nav>
        <div className="dg-sidebar-bottom">
          <div className="dg-demo-note">
            <span className="dg-status-dot" /> A workspace of possibilities
            <p>
              Dashboards and everyday workflows.
              <br />A clearer way to see your work.
            </p>
          </div>
          <button
            className="dg-help-button"
            onClick={() => setHelp((v) => !v)}
            aria-expanded={help}
          >
            <CircleHelp />
            About this collection
            <ChevronRight />
          </button>
          <div className="dg-profile">
            <Avatar name="Alex Morgan" />
            <div>
              <strong>Alex Morgan</strong>
              <small>Demo workspace</small>
            </div>
            <span className="dg-online" />
          </div>
        </div>
      </aside>
      <div className="dg-main-shell">
        <header className="dg-topbar">
          <div>
            <Button
              variant="ghost"
              size="icon"
              className="dg-mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onPress={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
            <span className="dg-breadcrumb-root">Workspace</span>
            <ChevronRight />
            <Icon />
            <strong>{current.name}</strong>
          </div>
          <span className="dg-sample-label">
            <span />
            Sample data
          </span>
        </header>
        <main id="dashboard-main" className="dg-main">
          <header className="dg-page-heading" hidden={page === 'orders'}>
            <div>
              <h1>{current.kind}</h1>
              <p>{current.subtitle}</p>
            </div>
            <span className="dg-page-index">
              {pages.findIndex((p) => p.id === page) + 1}{' '}
              <span>/ {pages.length} examples</span>
            </span>
          </header>
          {help && (
            <section className="dg-about">
              <div>
                <h2>Seven examples, ready to explore.</h2>
                <p>
                  Switch examples in the sidebar. Try date ranges, deal stages,
                  order fulfillment, transaction filters, task statuses, and
                  demo replies. All data is fictional. Changes remain in memory
                  and reset on reload; no business records are affected.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close collection information"
                onPress={() => setHelp(false)}
              >
                <X />
              </Button>
            </section>
          )}
          <div hidden={page !== 'analytics'}>
            <Analytics notify={message => toast(message)} />
          </div>
          <div hidden={page !== 'sales'}>
            <Sales />
          </div>
          <div hidden={page !== 'commerce'}>
            <Commerce notify={message => toast(message)} />
          </div>
          <div hidden={page !== 'finance'}>
            <Finance />
          </div>
          <div hidden={page !== 'projects'}>
            <Projects />
          </div>
          <div hidden={page !== 'orders'}>
            <DashboardOrders notify={message => toast(message)} />
          </div>
          <div hidden={page !== 'support'}>
            <Support notify={message => toast(message)} />
          </div>
          <footer className="dg-page-footer">
            <span>
              <Activity />
              Built for a clearer working day.
            </span>
            <span>Kernel collection · Illustrative data</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
