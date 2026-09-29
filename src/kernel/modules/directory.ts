import type { ModuleSource } from '../module-contract'
import { text, date, status, transition, archive, base } from './fields'

export const accountModule: ModuleSource = {
  ...base, id: 'directory.account', defaultAlias: 'customers', grammar: 'directory', ports: [],
  definition: {
    slug: 'account', name: 'Accounts', description: 'Prospect and customer organizations with shared contact details.',
    entity: { name: 'party', label: 'Account', fields: {
      title: { label: 'Account name', type: 'string', min: 2, max: 100 }, contact: text('General contact'),
      website: text('Website', 250), industry: text('Industry'), notes: text('Account notes', 4000),
      relationship: { label: 'Relationship', type: 'enum', options: ['Prospect', 'Customer', 'Partner'], default: 'Prospect' },
      status: status(['active', 'archived']),
    } }, settings: {}, reviewerRoles: ['owner'], actions: [archive, transition('restore', 'Restore', 'archived', 'active')],
  },
  views: [{ id: 'accounts', name: 'Active accounts', columns: ['title', 'relationship', 'contact', 'industry'], filters: [{ field: 'status', operator: 'eq', value: 'active' }] }],
}
export const personModule: ModuleSource = {
  ...base, id: 'directory.person', defaultAlias: 'people', grammar: 'directory', ports: [],
  definition: {
    slug: 'person', name: 'Team', description: 'Named people for business ownership. These directory records do not grant login access.',
    entity: { name: 'person', label: 'Team member', fields: { title: { label: 'Name', type: 'string', min: 2, max: 100 }, email: text('Email'), status: status(['active', 'archived']) } },
    settings: {}, reviewerRoles: ['owner'], actions: [archive, transition('restore', 'Restore', 'archived', 'active')],
  }, views: [{ id: 'team', name: 'Team directory', columns: ['title', 'email', 'status'] }],
}
export const contactModule: ModuleSource = {
  ...base, id: 'directory.contact', defaultAlias: 'contacts', grammar: 'directory',
  ports: [{ field: 'account', target: 'directory.account', label: 'Account' }],
  definition: {
    slug: 'contact', name: 'Contacts', description: 'People at accounts, including their role and contact details.',
    entity: { name: 'contact', label: 'Contact', fields: { title: { label: 'Name', type: 'string', min: 2, max: 100 }, email: text('Email'), phone: text('Phone', 50), role: text('Job title'), notes: text('Relationship notes', 4000), status: status(['active', 'archived']) } },
    settings: {}, reviewerRoles: ['owner'], actions: [archive, transition('restore', 'Restore', 'archived', 'active')],
  }, views: [{ id: 'contacts', name: 'Contacts', columns: ['title', 'account', 'email', 'phone', 'role'] }],
}

export const directoryModules = [accountModule, personModule, contactModule]
