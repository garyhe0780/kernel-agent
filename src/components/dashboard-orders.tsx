import { useEffect, useRef, useState } from 'react'
import {
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
} from 'react-aria-components'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Coffee,
  Download,
  Headphones,
  Laptop,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Form,
} from '@/components/ui/form-field'
import { Badge, Empty, ToggleGroup } from '@/components/ui/surfaces'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

const products = [
  {
    name: 'Everyday canvas tote',
    sku: 'BAG-001',
    price: 42,
    icon: ShoppingBag,
    color: 'sand',
  },
  {
    name: 'Studio notebook',
    sku: 'PPR-012',
    price: 28,
    icon: BookOpen,
    color: 'blue',
  },
  {
    name: 'Ceramic coffee cup',
    sku: 'HME-024',
    price: 32,
    icon: Coffee,
    color: 'sage',
  },
  {
    name: 'Aluminum laptop stand',
    sku: 'DSK-008',
    price: 89,
    icon: Laptop,
    color: 'slate',
  },
  {
    name: 'Wireless headphones',
    sku: 'AUD-003',
    price: 149,
    icon: Headphones,
    color: 'lilac',
  },
  {
    name: 'Desk essentials kit',
    sku: 'DSK-016',
    price: 128,
    icon: Package,
    color: 'sand',
  },
] as const
const customers = [
  'Olivia Rhye',
  'Phoenix Baker',
  'Lana Steiner',
  'Demi Wilkinson',
  'Drew Cano',
  'Natali Craig',
  'Orlando Diggs',
  'Andi Lane',
  'Kate Morrison',
  'Koray Okumus',
  'Candice Wu',
  'Davis Philips',
  'Maya Patel',
  'Noah Kim',
  'Amelia Brooks',
  'Ethan Chen',
  'Isla Turner',
  'Leo Martin',
  'Sofia Reyes',
  'Jack Wilson',
  'Ava Thompson',
  'Luca Rossi',
  'Grace Lee',
  'Oscar Morgan',
]
const statuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled'] as const
type Status = (typeof statuses)[number]
type Order = {
  id: number
  product: number
  customer: string
  email: string
  quantity: number
  type: 'Sale' | 'Refund'
  total: number
  date: string
  status: Status
}
type SortKey = 'id' | 'customer' | 'total' | 'date'
const initialOrders: Order[] = customers.map((customer, i) => ({
  id: 1048 - i,
  product: i % products.length,
  customer,
  email: `${customer.toLowerCase().replace(' ', '.')}@example.com`,
  quantity: i % 5 === 0 ? 2 : 1,
  type: i % 7 === 4 ? 'Refund' : 'Sale',
  total: products[i % products.length].price * (i % 5 === 0 ? 2 : 1),
  date: `2026-09-${String(27 - Math.floor(i / 2)).padStart(2, '0')}`,
  status: i % 7 === 4 ? 'Cancelled' : statuses[[0, 0, 1, 2, 0, 2, 1][i % 7]],
}))
const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value,
  )
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      variant={
        status === 'Delivered'
          ? 'success'
          : status === 'Shipped'
            ? 'primary'
            : status === 'Pending'
              ? 'warning'
              : 'neutral'
      }
    >
      <span className="dg-order-status-dot" />
      {status}
    </Badge>
  )
}
function exportOrders(rows: Order[]) {
  const cells = [
    [
      'Order',
      'Product',
      'Customer',
      'Email',
      'Type',
      'Total USD',
      'Date',
      'Status',
    ],
    ...rows.map((o) => [
      `#${o.id}`,
      products[o.product].name,
      o.customer,
      o.email,
      o.type,
      o.total.toFixed(2),
      o.date,
      o.status,
    ]),
  ]
  const csv = cells
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','),
    )
    .join('\r\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'orders-sample.csv'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function DashboardOrders({
  notify,
}: {
  notify: (message: string) => void
}) {
  const [orders, setOrders] = useState(initialOrders)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All orders')
  const [type, setType] = useState('All types')
  const [period, setPeriod] = useState('All dates')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<{
    key: SortKey
    direction: 'ascending' | 'descending'
  }>({ key: 'id', direction: 'descending' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)
  const allCheckbox = useRef<HTMLInputElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const filtered = orders
    .filter(
      (o) =>
        (status === 'All orders' || o.status === status) &&
        (type === 'All types' || o.type === type) &&
        (period === 'All dates' || o.date >= '2026-09-21') &&
        `${o.id} ${o.customer} ${o.email} ${products[o.product].name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      const result =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y))
      return result * (sort.direction === 'ascending' ? 1 : -1)
    })
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )
  const allSelected =
    rows.length > 0 && rows.every((o) => selected.includes(o.id))
  const active = orders.find((o) => o.id === activeId)
  const pendingSelected = orders.filter(
    (o) => selected.includes(o.id) && o.status === 'Pending',
  )
  const activeFilters =
    Number(type !== 'All types') + Number(period !== 'All dates')
  useEffect(() => {
    if (allCheckbox.current)
      allCheckbox.current.indeterminate =
        !allSelected && rows.some((o) => selected.includes(o.id))
  }, [allSelected, rows, selected])
  useEffect(() => {
    if (activeId !== null) detailRef.current?.focus()
  }, [activeId])
  const resetPage = () => {
    setPage(1)
    setSelected([])
  }
  const changeSort = (key: SortKey) => {
    setSort((old) => ({
      key,
      direction:
        old.key === key && old.direction === 'ascending'
          ? 'descending'
          : 'ascending',
    }))
    resetPage()
  }
  const changeStatus = (id: number, next: Status) => {
    setOrders((old) =>
      old.map((o) => (o.id === id ? { ...o, status: next } : o)),
    )
    setSelected([])
    notify(`Order #${id} marked ${next.toLowerCase()}. Demo data only.`)
  }
  const resetFilters = () => {
    setQuery('')
    setStatus('All orders')
    setType('All types')
    setPeriod('All dates')
    resetPage()
  }
  function renderSortHeader({
    label,
    column,
  }: {
    label: string
    column: SortKey
  }) {
    return (
      <th scope="col" aria-sort={sort.key === column ? sort.direction : 'none'}>
        <button onClick={() => changeSort(column)}>
          {label}
          {sort.key === column ? (
            sort.direction === 'ascending' ? (
              <ArrowUp />
            ) : (
              <ArrowDown />
            )
          ) : (
            <ArrowUpDown />
          )}
        </button>
      </th>
    )
  }
  return (
    <div className="dg-orders">
      <header className="dg-page-heading">
        <div>
          <h1>
            Orders <span className="dg-order-count">{orders.length}</span>
          </h1>
          <p>Manage, track, and fulfill your customer orders.</p>
        </div>
        <div className="dg-actions">
          <Button
            variant="outline"
            onPress={() => {
              exportOrders(
                selected.length
                  ? filtered.filter((o) => selected.includes(o.id))
                  : filtered,
              )
              notify(
                'Orders CSV prepared from the current selection or filters.',
              )
            }}
            disabled={!filtered.length}
          >
            <Download data-icon="inline-start" />
            Export
          </Button>
          <Button
            onPress={() => {
              setCreateOpen((v) => !v)
              setActiveId(null)
            }}
            aria-expanded={createOpen}
          >
            <Plus data-icon="inline-start" />
            Create order
          </Button>
        </div>
      </header>
      {createOpen && (
        <section className="dg-order-create" aria-label="Create demo order">
          <header>
            <div>
              <h2>Create order</h2>
              <p>Add a fictional order to this session.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close create order"
              onPress={() => setCreateOpen(false)}
            >
              <X />
            </Button>
          </header>
          <Form
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              const customer = String(data.get('customer')).trim()
              const email = String(data.get('email')).trim()
              const product = Number(data.get('product'))
              const quantity = Number(data.get('quantity'))
              if (
                !customer ||
                !email ||
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                quantity > 99
              ) {
                setFormError(
                  'Enter a customer name, valid email, and quantity between 1 and 99.',
                )
                return
              }
              const nextId = Math.max(...orders.map((o) => o.id)) + 1
              setOrders((old) => [
                {
                  id: nextId,
                  customer,
                  email,
                  product,
                  quantity,
                  total: products[product].price * quantity,
                  type: 'Sale',
                  date: '2026-09-27',
                  status: 'Pending',
                },
                ...old,
              ])
              resetFilters()
              setSort({ key: 'id', direction: 'descending' })
              setCreateOpen(false)
              setFormError('')
              notify(`Demo order #${nextId} created.`)
            }}
          >
            <FieldGroup className="dg-order-fields">
              <Field name="customer" isRequired>
                <FieldLabel>Customer name</FieldLabel>
                <Input placeholder="e.g. Alex Morgan" />
                <FieldError />
              </Field>
              <Field name="email" type="email" isRequired>
                <FieldLabel>Email address</FieldLabel>
                <Input placeholder="alex@example.com" />
                <FieldError />
              </Field>
              <label>
                Product
                <select name="product" defaultValue="0">
                  {products.map((p, i) => (
                    <option key={p.sku} value={i}>
                      {p.name} · {currency(p.price)}
                    </option>
                  ))}
                </select>
              </label>
              <Field name="quantity" isRequired defaultValue="1">
                <FieldLabel>Quantity</FieldLabel>
                <Input type="number" min={1} max={99} />
                <FieldError />
              </Field>
            </FieldGroup>
            {formError && (
              <p className="dg-order-error" role="alert">
                {formError}
              </p>
            )}
            <footer>
              <Button variant="outline" onPress={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create demo order</Button>
            </footer>
          </Form>
        </section>
      )}
      {active && (
        <section
          className="dg-order-detail"
          ref={detailRef}
          tabIndex={-1}
          aria-label={`Order #${active.id} details`}
        >
          <header>
            <div>
              <h2>Order #{active.id}</h2>
              <p>
                {dateLabel(active.date)} · {active.type}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close order details"
              onPress={() => setActiveId(null)}
            >
              <X />
            </Button>
          </header>
          <dl>
            <div>
              <dt>Customer</dt>
              <dd>
                {active.customer}
                <small>{active.email}</small>
              </dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>
                {products[active.product].name}
                <small>
                  Quantity: {active.quantity} · {products[active.product].sku}
                </small>
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                {currency(active.total)}
                <small>USD · sample order</small>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={active.status} />
              </dd>
            </div>
          </dl>
          {(active.status === 'Pending' || active.status === 'Shipped') && (
            <Button
              variant="outline"
              onPress={() =>
                changeStatus(
                  active.id,
                  active.status === 'Pending' ? 'Shipped' : 'Delivered',
                )
              }
            >
              <Truck data-icon="inline-start" />
              {active.status === 'Pending' ? 'Mark shipped' : 'Mark delivered'}
            </Button>
          )}
        </section>
      )}
      <div className="dg-orders-tabs">
        <ToggleGroup
          label="Filter orders by status"
          value={status}
          onChange={(value) => {
            setStatus(value)
            resetPage()
          }}
          options={['All orders', ...statuses].map((value) => ({
            value,
            label: `${value} ${value === 'All orders' ? orders.length : orders.filter((o) => o.status === value).length}`,
          }))}
        />
      </div>
      <div className="dg-orders-tools">
        <InputGroup className="dg-search">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search order list"
            placeholder="Search orders, products, or customers…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetPage()
            }}
          />
        </InputGroup>
        <div className="dg-actions">
          <span className="dg-orders-result" role="status">
            {filtered.length} orders
          </span>
          <Button
            variant="outline"
            onPress={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            aria-controls="dg-order-filters"
          >
            <SlidersHorizontal data-icon="inline-start" />
            Filters{activeFilters > 0 && ` (${activeFilters})`}
          </Button>
        </div>
      </div>
      {filterOpen && (
        <div className="dg-order-filters" id="dg-order-filters">
          <label>
            Order type
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                resetPage()
              }}
            >
              {['All types', 'Sale', 'Refund'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Date placed
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value)
                resetPage()
              }}
            >
              <option>All dates</option>
              <option>Sep 21–27, 2026</option>
            </select>
          </label>
          <Button variant="ghost" onPress={resetFilters}>
            Reset filters
          </Button>
        </div>
      )}
      {selected.length > 0 && (
        <div className="dg-selection">
          <strong>{selected.length} selected on this page</strong>
          <Button
            variant="outline"
            disabled={!pendingSelected.length}
            onPress={() => {
              setOrders((old) =>
                old.map((o) =>
                  selected.includes(o.id) && o.status === 'Pending'
                    ? { ...o, status: 'Shipped' }
                    : o,
                ),
              )
              setSelected([])
              notify(`${pendingSelected.length} pending orders marked shipped.`)
            }}
          >
            <Truck data-icon="inline-start" />
            Ship pending ({pendingSelected.length})
          </Button>
          <Button variant="ghost" onPress={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}
      <div className="dg-orders-table-frame">
        <div
          className="dg-table-scroll"
          role="region"
          aria-label="Orders table, scroll horizontally for all columns"
          tabIndex={0}
        >
          <table aria-label="Orders">
            <thead>
              <tr>
                <th scope="col">
                  <input
                    ref={allCheckbox}
                    type="checkbox"
                    aria-label="Select all orders on this page"
                    checked={allSelected}
                    disabled={!rows.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? rows.map((o) => o.id) : [])
                    }
                  />
                </th>
                {renderSortHeader({ label: 'Order', column: 'id' })}
                <th scope="col">Product</th>
                {renderSortHeader({ label: 'Customer', column: 'customer' })}
                <th scope="col">Type</th>
                {renderSortHeader({ label: 'Total', column: 'total' })}
                {renderSortHeader({ label: 'Date', column: 'date' })}
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const product = products[order.product]
                const Icon = product.icon
                return (
                  <tr
                    key={order.id}
                    data-selected={selected.includes(order.id) || undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select order #${order.id}`}
                        checked={selected.includes(order.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, order.id]
                              : old.filter((id) => id !== order.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="dg-order-link"
                        onClick={() => {
                          setActiveId(order.id)
                          setCreateOpen(false)
                        }}
                      >
                        #{order.id}
                      </button>
                    </td>
                    <td>
                      <div className="dg-order-product">
                        <span
                          className={`dg-order-product-icon tone-${product.color}`}
                        >
                          <Icon aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.sku} · Qty {order.quantity}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{order.customer}</strong>
                      <small>{order.email}</small>
                    </td>
                    <td>{order.type}</td>
                    <td className="dg-order-total">{currency(order.total)}</td>
                    <td>{dateLabel(order.date)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>
                      <MenuTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for order #${order.id}`}
                        >
                          <MoreHorizontal />
                        </Button>
                        <Popover
                          placement="bottom end"
                          className="dg-orders-popover"
                        >
                          <Menu
                            aria-label={`Order #${order.id} actions`}
                            className="dg-orders-menu"
                          >
                            <MenuSection aria-label="Order actions">
                              <MenuItem
                                onAction={() => {
                                  setActiveId(order.id)
                                  setCreateOpen(false)
                                }}
                              >
                                View order
                              </MenuItem>
                              <MenuItem
                                isDisabled={order.status !== 'Pending'}
                                onAction={() =>
                                  changeStatus(order.id, 'Shipped')
                                }
                              >
                                Mark shipped
                              </MenuItem>
                              <MenuItem
                                isDisabled={order.status !== 'Shipped'}
                                onAction={() =>
                                  changeStatus(order.id, 'Delivered')
                                }
                              >
                                Mark delivered
                              </MenuItem>
                            </MenuSection>
                          </Menu>
                        </Popover>
                      </MenuTrigger>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="No orders found">
            <p>Try another search or clear your filters.</p>
            <Button variant="outline" onPress={resetFilters}>
              Clear filters
            </Button>
          </Empty>
        )}
      </div>
      <footer className="dg-orders-pagination">
        <span>
          {selected.length} of {rows.length} rows selected
        </span>
        <div className="dg-pagination-controls">
          <label>
            Rows per page
            <select
              aria-label="Orders per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                resetPage()
              }}
            >
              {[5, 10, 20].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <span>
            {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <nav aria-label="Order pagination">
            <Button
              variant="outline"
              size="icon"
              aria-label="First page"
              disabled={currentPage === 1}
              onPress={() => {
                setPage(1)
                setSelected([])
              }}
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onPress={() => {
                setPage(currentPage - 1)
                setSelected([])
              }}
            >
              <ChevronLeft />
            </Button>
            {Array.from(
              { length: Math.min(5, pageCount) },
              (_, i) =>
                Math.max(1, Math.min(currentPage - 2, pageCount - 4)) + i,
            ).map((n) => (
              <Button
                key={n}
                variant={n === currentPage ? 'primary' : 'outline'}
                size="icon"
                aria-label={`Page ${n}`}
                aria-current={n === currentPage ? 'page' : undefined}
                onPress={() => {
                  setPage(n)
                  setSelected([])
                }}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onPress={() => {
                setPage(currentPage + 1)
                setSelected([])
              }}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Last page"
              disabled={currentPage === pageCount}
              onPress={() => {
                setPage(pageCount)
                setSelected([])
              }}
            >
              <ChevronsRight />
            </Button>
          </nav>
        </div>
      </footer>
      <p className="dg-orders-footnote">
        <Check />
        Sample store · Prices in USD · Changes stay in this session
      </p>
    </div>
  )
}
