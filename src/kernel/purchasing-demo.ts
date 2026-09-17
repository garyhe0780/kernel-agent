import { compileAssembly, purchasingAssembly, type Application } from './application'
import type { Assembly } from './assembly'
import type { RecordData } from './definition'

export const DEMO_PURCHASING_SLUG = 'demo-purchasing'

export function isPurchasingDemo(slug: string) {
  return slug === DEMO_PURCHASING_SLUG
}

export function purchasingDemoAssembly(): Assembly {
  const assembly = purchasingAssembly()
  return {
    ...assembly,
    name: 'Demo · Team purchasing',
    description: 'Sample suppliers and purchase requests so you can try queues, actions, and review before building your own application.',
    assumptions: [
      ...assembly.assumptions.filter(item => !item.includes('will not be published')),
      'This is a Kernel demo with sample records. Remove it when you no longer need it.',
    ],
  }
}

export function purchasingDemoApplication(): Application {
  return compileAssembly(purchasingDemoAssembly())
}

export const purchasingDemoSuppliers: RecordData[] = [
  { title: 'Figma', contact: 'accounts@figma.example', status: 'active' },
  { title: 'Dell Technologies', contact: 'sales@dell.example', status: 'active' },
  { title: 'Fieldwork Studio', contact: 'hello@fieldwork.example', status: 'active' },
  { title: 'Staples', contact: 'orders@staples.example', status: 'active' },
  { title: 'Northstar Security', contact: 'intake@northstar.example', status: 'active' },
  { title: 'Notion', contact: 'renewals@notion.example', status: 'active' },
]

export const purchasingDemoRequests: { supplier: string; hoursAgo: number; data: RecordData }[] = [
  { supplier: 'Figma', hoursAgo: 6, data: { title: 'Design team software licenses', amountCents: 432000, category: 'Software', justification: 'Annual seats for the six-person product design team.', supplierVerified: true, status: 'submitted', decisionNote: '' } },
  { supplier: 'Dell Technologies', hoursAgo: 5, data: { title: 'Engineering monitors', amountCents: 284000, category: 'Equipment', justification: 'Four monitors for the incoming engineering team.', supplierVerified: true, status: 'submitted', decisionNote: '' } },
  { supplier: 'Fieldwork Studio', hoursAgo: 4, data: { title: 'Customer research study', amountCents: 1250000, category: 'Services', justification: 'Recruitment and interviews for the next product discovery cycle.', supplierVerified: true, status: 'submitted', decisionNote: '' } },
  { supplier: 'Staples', hoursAgo: 3, data: { title: 'Office supplies · September', amountCents: 34800, category: 'Office', justification: 'Monthly stationery and shared office essentials.', supplierVerified: true, status: 'draft', decisionNote: '' } },
  { supplier: 'Northstar Security', hoursAgo: 2, data: { title: 'Security assessment', amountCents: 680000, category: 'Services', justification: 'Independent review of the customer-facing application.', supplierVerified: false, status: 'submitted', decisionNote: '' } },
  { supplier: 'Notion', hoursAgo: 1, data: { title: 'Team documentation workspace', amountCents: 192000, category: 'Software', justification: 'Renewal of the internal documentation workspace.', supplierVerified: true, status: 'approved', decisionNote: 'Renewed on the existing plan.' } },
]
