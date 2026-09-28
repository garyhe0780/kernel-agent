import { composeSurface } from './blocks'
import type { GrammarId } from './grammars'
import { grammarById } from './grammars'
import { moduleById } from './modules'

/** Closed catalog of typical application types. A pattern names modules, links, grammar per surface, and the home surface. */

export type PatternSurface = {
  grammar: GrammarId
  of: string
  view?: string
  label?: string
  name?: string
}

export const appShells = ['inbox', 'dashboard', 'ledger', 'tracker'] as const
export type AppShell = (typeof appShells)[number]

export type KernelPattern = {
  id: string
  name: string
  description: string
  assumptions: string[]
  shell: AppShell
  home: string
  modules: { use: string; version?: number; as: string; name?: string; label?: string; settings?: Record<string, string | number | boolean> }[]
  links: { from: string; to: string }[]
  surfaces: PatternSurface[]
}

function purchasingPattern(): KernelPattern {
  return {
    id: 'purchasing',
    name: 'Team purchasing',
    description: 'Manage suppliers and purchase requests, with a reviewed decision for every purchase.',
    shell: 'ledger',
    assumptions: [
      'All purchase decisions require owner review.',
      'Requests above the configured approval ceiling are blocked; this is a hard limit, not an escalation.',
      'Supplier verification is recorded on each request; it is not inferred from the supplier.',
      'Example records are for preview only and will not be published.',
    ],
    home: 'awaiting_decision',
    modules: [
      { use: 'purchasing.request', as: 'requests', settings: { approvalLimitCents: 1000000, requireVerifiedSupplier: true } },
      { use: 'directory.party', as: 'suppliers', name: 'Suppliers', label: 'Supplier' },
    ],
    links: [{ from: 'requests.supplier', to: 'suppliers' }],
    surfaces: [
      { grammar: 'ledger', of: 'requests', view: 'awaiting_decision', label: 'Purchase requests' },
      { grammar: 'directory', of: 'suppliers', view: 'active', label: 'Suppliers', name: 'Active suppliers' },
      { grammar: 'detail', of: 'requests' },
    ],
  }
}

function crmPattern(): KernelPattern {
  return {
    id: 'crm',
    name: 'Team CRM',
    description: 'Track customers and sales opportunities, with a reviewed conversion for every deal.',
    shell: 'dashboard',
    assumptions: [
      'Conversion and lost decisions require owner review.',
      'Customer details live on the directory record; the opportunity stores the selected customer.',
      'Operate opportunities on the board. The overview counts records; it is not a second workspace.',
      'Example records are for preview only and will not be published.',
    ],
    home: 'overview',
    modules: [
      { use: 'sales.opportunity', as: 'opportunities' },
      { use: 'directory.party', as: 'customers', name: 'Customers', label: 'Customer' },
    ],
    links: [{ from: 'opportunities.customer', to: 'customers' }],
    surfaces: [
      { grammar: 'overview', of: 'opportunities', view: 'overview', label: 'Opportunities', name: 'Pipeline overview' },
      { grammar: 'board', of: 'opportunities', view: 'pipeline', name: 'Opportunity board' },
      { grammar: 'directory', of: 'customers', view: 'active', label: 'Customers', name: 'Active customers' },
      { grammar: 'detail', of: 'opportunities' },
    ],
  }
}

function issuesPattern(): KernelPattern {
  return {
    id: 'issues',
    name: 'Team issues',
    description: 'Track issues across projects, with an optional assignee on each issue.',
    shell: 'tracker',
    assumptions: [
      'Every issue belongs to a project.',
      'Assignees are optional; unassigned issues stay in the project queue.',
      'Start, complete and cancel are staged; a human apply commits them.',
      'The board is the home surface. There is no issues dashboard.',
      'Example records are for preview only and will not be published.',
    ],
    home: 'board',
    modules: [
      { use: 'work.issue', as: 'issues' },
      { use: 'work.project', as: 'projects' },
      { use: 'directory.party', as: 'people', name: 'People', label: 'Person' },
    ],
    links: [
      { from: 'issues.project', to: 'projects' },
      { from: 'issues.assignee', to: 'people' },
    ],
    surfaces: [
      { grammar: 'board', of: 'issues', view: 'board', label: 'Issues' },
      { grammar: 'ledger', of: 'issues', view: 'backlog', name: 'Backlog' },
      { grammar: 'ledger', of: 'issues', view: 'started', name: 'Started' },
      { grammar: 'ledger', of: 'projects', view: 'planned', label: 'Projects' },
      { grammar: 'directory', of: 'people', view: 'active', label: 'People', name: 'Active people' },
      { grammar: 'detail', of: 'issues' },
      { grammar: 'detail', of: 'projects' },
    ],
  }
}

function paymentsPattern(): KernelPattern {
  return {
    id: 'payments',
    name: 'Team payments',
    description: 'Record inbound and outbound movements with counterparties, with a reviewed post or fail for every draft.',
    shell: 'ledger',
    assumptions: [
      'Direction is inbound or outbound. Amount is unsigned cents; Kernel does not convert currency.',
      'Post and fail are staged; a human apply commits them. There is no approval ceiling.',
      'The ledger is the home surface. Overview counts, status, integer totals, and created-this-week trend only.',
      'Example records are for preview only and will not be published.',
    ],
    home: 'ledger',
    modules: [
      { use: 'finance.movement', as: 'movements' },
      { use: 'directory.party', as: 'counterparties', name: 'Counterparties', label: 'Counterparty' },
    ],
    links: [{ from: 'movements.counterparty', to: 'counterparties' }],
    surfaces: [
      { grammar: 'ledger', of: 'movements', view: 'ledger', label: 'Movements' },
      { grammar: 'overview', of: 'movements', view: 'overview', name: 'Movement overview' },
      { grammar: 'directory', of: 'counterparties', view: 'active', label: 'Counterparties', name: 'Active counterparties' },
      { grammar: 'detail', of: 'movements' },
    ],
  }
}

function supportPattern(): KernelPattern {
  return {
    id: 'support',
    name: 'Team support',
    description: 'Track support tickets from requesters on a board of open, waiting, and resolved work.',
    assumptions: [
      'Every ticket has a requester. Tickets do not belong to a project.',
      'Wait, resolve, resume and reopen are staged; a human apply commits them.',
      'The inbox is the home surface: a ticket list beside the open ticket. This is not an issue board and not an email client.',
      'Example records are for preview only and will not be published.',
    ],
    shell: 'inbox',
    home: 'board',
    modules: [
      { use: 'support.ticket', as: 'tickets' },
      { use: 'directory.party', as: 'requesters', name: 'Requesters', label: 'Requester' },
    ],
    links: [{ from: 'tickets.requester', to: 'requesters' }],
    surfaces: [
      { grammar: 'board', of: 'tickets', view: 'board', label: 'Tickets' },
      { grammar: 'directory', of: 'requesters', view: 'active', label: 'Requesters', name: 'Active requesters' },
      { grammar: 'detail', of: 'tickets' },
    ],
  }
}

export const kernelPatterns: KernelPattern[] = [purchasingPattern(), crmPattern(), issuesPattern(), paymentsPattern(), supportPattern()]

export function patternById(id: string) {
  return kernelPatterns.find(pattern => pattern.id === id)
}

export function appShellForPattern(id: string | null | undefined): AppShell | 'desk' {
  return patternById(id ?? '')?.shell ?? 'desk'
}

export function patternCatalog() {
  return kernelPatterns.map(pattern => ({
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    home: pattern.home,
    shell: pattern.shell,
    homeGrammar: pattern.surfaces.find(surface => surface.view === pattern.home)?.grammar ?? null,
    modules: pattern.modules.map(item => ({ use: item.use, version: item.version ?? 1, as: item.as })),
    links: pattern.links.map(link => ({ ...link })),
    surfaces: pattern.surfaces.map(surface => {
      const grammar = grammarById(surface.grammar)
      if (!grammar) throw new Error(`Unknown grammar: ${surface.grammar}`)
      const instance = pattern.modules.find(item => item.as === surface.of)
      const mod = moduleById(instance?.use ?? '', instance?.version ?? 1)
      return {
        grammar: surface.grammar,
        of: surface.of,
        view: surface.view,
        name: surface.name ?? (surface.grammar === 'detail' ? `${mod?.definition.entity.label ?? surface.of} details` : (mod?.views.find(view => view.id === surface.view)?.name ?? surface.view)),
        label: surface.label,
        blocks: composeSurface(surface.grammar).map(block => block.id),
      }
    }),
  }))
}

export type PatternSnapshot = ReturnType<typeof patternCatalog>[number]
