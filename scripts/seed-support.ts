import { getPlatformProxy } from 'wrangler'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Kernel } from '../src/kernel/engine.server'
import type { Principal } from '../src/kernel/definition'

const PROJECT = 'app-cmu47jqpe0001vx0mvs2hi7xv'
const CUSTOMERS = `${PROJECT}__customers`
const TICKETS = `${PROJECT}__tickets`

type Hyperdrive = { connectionString: string }

async function apply(kernel: Kernel, owner: Principal, recordId: string, action: string) {
  const staged = await kernel.stage(owner, { recordId, action, input: {}, idempotencyKey: `sample-${action}-${recordId}` })
  if (staged.status !== 'staged' || !staged.change) throw new Error(`${action} was not staged`)
  const reviewed = await kernel.review(owner, staged.change.id, 'apply')
  if (reviewed.status !== 'applied') throw new Error(`${action} was not applied`)
}

const proxy = await getPlatformProxy<{ HYPERDRIVE: Hyperdrive }>()
const connectionString = proxy.env.HYPERDRIVE?.connectionString
if (!connectionString) throw new Error('Hyperdrive is not bound.')

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })
const kernel = new Kernel(db)

try {
  const project = await db.project.findFirst({ where: { slug: PROJECT } })
  if (!project) throw new Error(`Application ${PROJECT} was not found.`)
  const member = await db.membership.findFirst({ where: { workspaceId: project.workspaceId, role: 'owner' }, include: { user: true } })
  if (!member) throw new Error('No owner for this workspace.')
  const owner: Principal = { userId: member.userId, name: member.user.name, workspaceId: project.workspaceId, role: member.role, kind: 'human' }

  const existing = await db.businessRecord.count({ where: { workspaceId: project.workspaceId, capability: { in: [CUSTOMERS, TICKETS] } } })
  if (existing > 0) {
    console.log(`already_seeded records=${existing}`)
  } else {
    const northwind = await kernel.createRecord(owner, { title: 'Northwind Labs', contact: 'Maya Chen · support@northwind.test' }, CUSTOMERS)
    const harbor = await kernel.createRecord(owner, { title: 'Harbor Retail', contact: 'Jordan Blake · ops@harbor.test' }, CUSTOMERS)
    const atlas = await kernel.createRecord(owner, { title: 'Atlas Freight', contact: 'Priya Shah · desk@atlas.test' }, CUSTOMERS)
    const clinic = await kernel.createRecord(owner, { title: 'Westside Clinic', contact: 'closed@westside.test' }, CUSTOMERS)
    await apply(kernel, owner, clinic.id, 'archive')

    const signIn = await kernel.createRecord(owner, { title: 'Cannot sign in on iOS', customer: harbor.id, priority: 'High', waitHours: 3 }, TICKETS)
    const invoice = await kernel.createRecord(owner, { title: 'Invoice PDF is blank', customer: northwind.id, priority: 'Normal', waitHours: 6 }, TICKETS)
    const rateLimit = await kernel.createRecord(owner, { title: 'Need API rate limit raised', customer: atlas.id, priority: 'Urgent', waitHours: 2 }, TICKETS)
    await kernel.createRecord(owner, { title: 'Password reset email delayed', customer: harbor.id, priority: 'Low', waitHours: 0 }, TICKETS)
    const csv = await kernel.createRecord(owner, { title: 'Export CSV encoding', customer: northwind.id, priority: 'Normal', waitHours: 8 }, TICKETS)
    const outage = await kernel.createRecord(owner, { title: 'Weekend outage follow-up', customer: atlas.id, priority: 'High', waitHours: 30 }, TICKETS)

    for (const record of [signIn, invoice, rateLimit, csv, outage]) await apply(kernel, owner, record.id, 'open')
    await apply(kernel, owner, rateLimit.id, 'wait')
    await apply(kernel, owner, csv.id, 'resolve')
    const pending = await kernel.stage(owner, { recordId: signIn.id, action: 'wait', input: {}, idempotencyKey: `sample-wait-pending-${signIn.id}` })
    if (pending.status !== 'staged') throw new Error('pending wait was not staged')
    console.log('pending_wait', pending.change?.id)
  }

  const customers = await db.businessRecord.findMany({ where: { workspaceId: project.workspaceId, capability: CUSTOMERS }, orderBy: { createdAt: 'asc' } })
  const tickets = await db.businessRecord.findMany({ where: { workspaceId: project.workspaceId, capability: TICKETS }, orderBy: { createdAt: 'asc' } })
  console.log('customers', customers.map(row => `${(row.data as { title: string }).title}:${(row.data as { status: string }).status}`).join(','))
  console.log('tickets', tickets.map(row => `${(row.data as { title: string }).title}:${(row.data as { status: string }).status}`).join(','))
} finally {
  await db.$disconnect()
  await proxy.dispose()
}
