import type { Definition } from './definition'

/** Business meanings, independent of the UI's SVG library. */
export const navigationIcons = ['purchase', 'organization', 'contact', 'people', 'deal', 'project', 'task', 'issue', 'payment', 'ticket', 'activity', 'milestone', 'asset', 'order', 'document', 'audit', 'records'] as const
export type NavigationIcon = (typeof navigationIcons)[number]

const entityIcons: Readonly<Record<string, NavigationIcon>> = {
  purchase_request: 'purchase',
  party: 'organization', organization: 'organization', company: 'organization', supplier: 'organization', customer: 'organization', account: 'organization',
  person: 'people', employee: 'people', member: 'people',
  contact: 'contact', opportunity: 'deal', deal: 'deal', lead: 'deal',
  project: 'project', task: 'task', issue: 'issue',
  movement: 'payment', payment: 'payment', invoice: 'order', order: 'order',
  ticket: 'ticket', activity: 'activity', milestone: 'milestone', asset: 'asset', equipment: 'asset',
  page: 'document', post: 'document', document: 'document', finding: 'audit',
}

export function inferNavigationIcon(definition?: Pick<Definition, 'slug' | 'entity'>): NavigationIcon {
  if (!definition) return 'records'
  // The generic party module can represent organizations or people. Only use
  // known person aliases for this ambiguous type, never localized display copy.
  const alias = definition.slug.split('__').at(-1)
  if (definition.entity.name === 'party' && ['people', 'persons', 'members', 'employees'].includes(alias ?? '')) return 'people'
  return Object.hasOwn(entityIcons, definition.entity.name) ? entityIcons[definition.entity.name] : 'records'
}
