import { definitionSchema, type Definition, type RecordData } from './definition'
import { procurement } from './procurement'
import { seedSuite, suite } from './suite'

/** Example catalog used by tests and the public journal fixture. Not Core. */

export type ViewKind = 'none' | 'hero' | 'article-list'

export type Package = {
  definition: Definition
  view: ViewKind
  order: number
}

export const site = definitionSchema.parse({
  slug: 'site', name: 'Site',
  description: 'A public landing page assembled from this package. Publish is a kernel action; drafts are not public.',
  entity: {
    name: 'page', label: 'Page',
    fields: {
      title: { label: 'Title', type: 'string', min: 3, max: 120 },
      standfirst: { label: 'Standfirst', type: 'string', min: 8, max: 400 },
      body: { label: 'Body', type: 'string', min: 8, max: 4000 },
      status: { label: 'Status', type: 'enum', options: ['draft', 'published'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    {
      name: 'publish', label: 'Publish page', description: 'Propose making this page visible on the public site.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Page is a draft', field: 'status', operator: 'eq', value: 'draft' }],
      policies: [], effects: { status: 'published' },
    },
    {
      name: 'unpublish', label: 'Unpublish page', description: 'Propose removing this page from the public site.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Page is published', field: 'status', operator: 'eq', value: 'published' }],
      policies: [], effects: { status: 'draft' },
    },
    {
      name: 'revise', label: 'Revise page', description: 'Propose new copy. A human must apply it before the public page changes.',
      roles: ['owner', 'operator'],
      input: {
        title: { label: 'Title', type: 'string', min: 3, max: 120 },
        standfirst: { label: 'Standfirst', type: 'string', min: 8, max: 400 },
        body: { label: 'Body', type: 'string', min: 8, max: 4000 },
      },
      preconditions: [], policies: [],
      effects: { title: '$input.title', standfirst: '$input.standfirst', body: '$input.body' },
    },
  ],
})

export const blog = definitionSchema.parse({
  slug: 'blog', name: 'Blog',
  description: 'Notes with a draft/publish lifecycle. Only published notes appear on the public site.',
  entity: {
    name: 'post', label: 'Note',
    fields: {
      title: { label: 'Title', type: 'string', min: 3, max: 120 },
      excerpt: { label: 'Excerpt', type: 'string', min: 8, max: 280 },
      body: { label: 'Body', type: 'string', min: 8, max: 8000 },
      status: { label: 'Status', type: 'enum', options: ['draft', 'published'], default: 'draft', editable: false },
    },
  },
  settings: {},
  reviewerRoles: ['owner'],
  actions: [
    {
      name: 'publish', label: 'Publish note', description: 'Propose making this note visible on the public site.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Note is a draft', field: 'status', operator: 'eq', value: 'draft' }],
      policies: [], effects: { status: 'published' },
    },
    {
      name: 'unpublish', label: 'Unpublish note', description: 'Propose removing this note from the public site.',
      roles: ['owner', 'operator'], input: {},
      preconditions: [{ id: 'state', label: 'Note is published', field: 'status', operator: 'eq', value: 'published' }],
      policies: [], effects: { status: 'draft' },
    },
    {
      name: 'revise', label: 'Revise note', description: 'Propose new copy. A human must apply it before the public note changes.',
      roles: ['owner', 'operator'],
      input: {
        title: { label: 'Title', type: 'string', min: 3, max: 120 },
        excerpt: { label: 'Excerpt', type: 'string', min: 8, max: 280 },
        body: { label: 'Body', type: 'string', min: 8, max: 8000 },
      },
      preconditions: [], policies: [],
      effects: { title: '$input.title', excerpt: '$input.excerpt', body: '$input.body' },
    },
  ],
})

export const catalog: Package[] = [
  { definition: site, view: 'hero', order: 0 },
  { definition: blog, view: 'article-list', order: 1 },
  { definition: procurement, view: 'none', order: 99 },
  ...suite.map((definition, index) => ({ definition, view: 'none' as const, order: 10 + index })),
]

export function packageBySlug(slug: string) {
  return catalog.find(item => item.definition.slug === slug)
}

export function catalogFor(slugs: string[]) {
  const allowed = new Set(slugs)
  return catalog.filter(item => allowed.has(item.definition.slug)).sort((a, b) => a.order - b.order)
}

export type PublicRecord = { id: string; capability: string; data: RecordData; createdAt: Date | string }

export type PublicBlock = {
  slug: string
  name: string
  view: Exclude<ViewKind, 'none'>
  records: PublicRecord[]
}

export function composePublic(records: PublicRecord[], installed = catalog): PublicBlock[] {
  const bySlug = new Map(installed.map(item => [item.definition.slug, item]))
  return [...installed]
    .filter((item): item is Package & { view: Exclude<ViewKind, 'none'> } => item.view !== 'none')
    .sort((a, b) => a.order - b.order)
    .map(item => ({
      slug: item.definition.slug,
      name: item.definition.name,
      view: item.view,
      records: records.filter(record => {
        const pkg = bySlug.get(record.capability)
        return pkg?.definition.slug === item.definition.slug && record.data.status === 'published'
      }),
    }))
    .filter(block => block.records.length > 0)
}

export function composeEditorial(records: PublicRecord[], installed = catalog): PublicBlock[] {
  const bySlug = new Map(installed.map(item => [item.definition.slug, item]))
  return [...installed]
    .filter((item): item is Package & { view: Exclude<ViewKind, 'none'> } => item.view !== 'none')
    .sort((a, b) => a.order - b.order)
    .map(item => ({
      slug: item.definition.slug,
      name: item.definition.name,
      view: item.view,
      records: records.filter(record => bySlug.get(record.capability)?.definition.slug === item.definition.slug),
    }))
}

export function seedFor(slug: string, workspaceName: string): { entity: string; data: RecordData; hoursAgo: number }[] {
  if (slug === 'site') {
    return [{
      entity: site.entity.name, hoursAgo: 6,
      data: {
        title: `${workspaceName} journal`,
        standfirst: 'This page is assembled from the Site project. Blog notes are an element of that project, not a separate product.',
        body: 'Seeded example. Drafts stay in the Site project. Only published records from packages with a public view appear here.',
        status: 'published',
      },
    }]
  }
  if (slug === 'blog') {
    return [
      {
        entity: blog.entity.name, hoursAgo: 5,
        data: {
          title: 'Packages, not pages',
          excerpt: 'A site is composed from packages installed in the Site project. Each package owns entities, actions, and a public view.',
          body: 'Site contributes a hero view. Blog contributes an article list. Procurement is a separate project with a workbench shell. A later package can add another view without changing the evaluator.',
          status: 'published',
        },
      },
      {
        entity: blog.entity.name, hoursAgo: 3,
        data: {
          title: 'Publish is a kernel action',
          excerpt: 'Writing a note creates a draft. Publishing stages a proposal. A human apply makes it public.',
          body: 'People and agents share those actions. The public page only reads published records. It cannot apply a proposal or inspect procurement.',
          status: 'published',
        },
      },
      {
        entity: blog.entity.name, hoursAgo: 1,
        data: {
          title: 'A note that is not public yet',
          excerpt: 'This draft exists in the Site project. It must not appear on the public site until publish is applied.',
          body: 'Use this record to stage a publish from the Site project or the simulator.',
          status: 'draft',
        },
      },
    ]
  }
  return seedSuite(slug)
}
