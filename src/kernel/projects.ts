export type ShellKind = 'workbench' | 'site'

export type ProjectTemplate = {
  slug: string
  name: string
  description: string
  shell: ShellKind
  packages: string[]
}

export type ProjectSnapshot = {
  slug: string
  name: string
  description: string
  shell: ShellKind
  packages: string[]
}

export const projectTemplates: ProjectTemplate[] = [
  {
    slug: 'site',
    name: 'Site',
    description: 'Write and publish the public journal.',
    shell: 'site',
    packages: ['site', 'blog'],
  },
  {
    slug: 'procurement',
    name: 'Procurement',
    description: 'Submit and approve purchase requests.',
    shell: 'workbench',
    packages: ['procurement'],
  },
  {
    slug: 'crm',
    name: 'CRM',
    description: 'Qualify leads and convert them.',
    shell: 'workbench',
    packages: ['crm'],
  },
  {
    slug: 'orders',
    name: 'Orders',
    description: 'Quote, confirm, and invoice orders.',
    shell: 'workbench',
    packages: ['orders'],
  },
  {
    slug: 'helpdesk',
    name: 'Help desk',
    description: 'Handle tickets from report to resolution.',
    shell: 'workbench',
    packages: ['helpdesk'],
  },
  {
    slug: 'projects',
    name: 'Project management',
    description: 'Track work from start to done.',
    shell: 'workbench',
    packages: ['projects'],
  },
  {
    slug: 'assets',
    name: 'IT assets',
    description: 'Stock, assign, and retire assets.',
    shell: 'workbench',
    packages: ['assets'],
  },
  {
    slug: 'hr',
    name: 'HR',
    description: 'Onboard employees, manage leave, and offboard.',
    shell: 'workbench',
    packages: ['hr'],
  },
  {
    slug: 'audit',
    name: 'Audit',
    description: 'Track findings, evidence notes, and remediation.',
    shell: 'workbench',
    packages: ['audit'],
  },
]

export function projectKind(project: { slug: string; shell: ShellKind }) {
  if (project.shell === 'site') return 'Public journal'
  const kinds: Record<string, string> = {
    procurement: 'Purchase queue',
    crm: 'Lead queue',
    orders: 'Order queue',
    helpdesk: 'Ticket queue',
    projects: 'Project queue',
    assets: 'Asset queue',
    hr: 'Employee queue',
    audit: 'Finding register',
  }
  return kinds[project.slug] ?? 'Operations queue'
}

export function projectTemplate(slug: string) {
  return projectTemplates.find(item => item.slug === slug)
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function toProjectSnapshot(row: { slug: string; name: string; shell: string; packages: unknown }): ProjectSnapshot {
  const template = projectTemplate(row.slug)
  return {
    slug: row.slug,
    name: row.name,
    description: template?.description ?? '',
    shell: row.shell === 'site' ? 'site' : 'workbench',
    packages: asStringList(row.packages),
  }
}

export function sortProjects<T extends { slug: string }>(rows: T[]) {
  const order = new Map(projectTemplates.map((item, index) => [item.slug, index]))
  return [...rows].sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99))
}
