import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PGlite } from '@electric-sql/pglite'
import { PrismaPGlite } from 'pglite-prisma-adapter'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from 'better-auth/crypto'
import { applyPgliteMigrations } from '../src/lib/pglite-migrations'
import { Kernel } from '../src/kernel/engine.server'
import { AgentAccess } from '../src/kernel/agent-access.server'
import type { Principal } from '../src/kernel/definition'

// Always create a new isolated database. Never uses DATABASE_URL or the real data directory.
const directory = await mkdtemp(join(tmpdir(), 'kernel-browser-acceptance-'))
const pg = new PGlite(join(directory, 'db'))
await applyPgliteMigrations(pg)
const db = new PrismaClient({ adapter: new PrismaPGlite(pg) as never })
try {
  const kernel = new Kernel(db), access = new AgentAccess(db)
  const email = 'browser-owner@acceptance.test'
  const password = 'Synthetic-only-2026!'
  const user = await db.user.create({ data: { id: 'browser-acceptance-owner', name: 'Browser acceptance owner', email } })
  await db.account.create({ data: { id: 'browser-acceptance-password', accountId: user.id, providerId: 'credential', userId: user.id, password: await hashPassword(password) } })
  const member = await kernel.ensureWorkspace(user)
  const owner: Principal = { userId: user.id, name: user.name, workspaceId: member.workspaceId, role: 'owner', kind: 'human' }
  const applications = []
  for (const pattern of ['crm', 'issues']) {
    const draft = await kernel.saveDraft(owner, { brief: `Synthetic browser ${pattern} acceptance`, pattern, source: 'manual' })
    const { slug } = await kernel.publishDraft(owner, draft.id, draft.version)
    const crm = pattern === 'crm'
    const parent = await kernel.createRecord(owner, { title: 'Synthetic Acme' }, `${slug}__${crm ? 'customers' : 'projects'}`)
    const capability = `${slug}__${crm ? 'opportunities' : 'issues'}`
    await access.create(owner, { project: slug, name: `Browser ${pattern} agent`, expiresInDays: 1, actions: ['$create', ...(crm ? ['open','convert'] : ['start','complete'])].map((action, index) => ({ capability, action, version: 1, execution: index === 1 ? 'automatic' : 'review' })) })
    applications.push({ pattern, slug, parentId: parent.id })
  }
  const manifest = { directory, database: join(directory, 'db'), email, password, workspaceId: member.workspaceId, applications }
  await writeFile(join(tmpdir(), 'kernel-browser-acceptance.json'), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify(manifest, null, 2))
} finally { await db.$disconnect(); await pg.close() }
