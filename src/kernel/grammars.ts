/** Closed catalog of working designs. A grammar chooses wired blocks, starting layout, and density. */

export const workingGrammars = ['overview', 'board', 'ledger', 'directory'] as const
export const grammarIds = [...workingGrammars, 'detail'] as const
export type WorkingGrammar = (typeof workingGrammars)[number]
export type GrammarId = (typeof grammarIds)[number]
export type GrammarDensity = 'comfortable' | 'dense'
export type GrammarLayout = 'stats' | 'board' | 'table' | 'directory' | 'detail'

export type KernelGrammar = {
  id: GrammarId
  name: string
  description: string
  blocks: string[]
  density: GrammarDensity
  layout: GrammarLayout
}

export const kernelGrammars: KernelGrammar[] = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'Counts, status breakdown, integer totals, and created-this-week trend for a bound view. Uses $createdAt; Kernel has no date field type.',
    blocks: ['stats', 'chart'],
    density: 'comfortable',
    layout: 'stats',
  },
  {
    id: 'board',
    name: 'Board',
    description: 'Columns of a bound view grouped by status. The starting layout is the board, not a table.',
    blocks: ['filters', 'board'],
    density: 'comfortable',
    layout: 'board',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    description: 'A dense decision table for a bound view. Queue-like rows, not a dashboard.',
    blocks: ['filters', 'table'],
    density: 'dense',
    layout: 'table',
  },
  {
    id: 'directory',
    name: 'Directory',
    description: 'A comfortable table of a bound view. People and organizations, not a work queue.',
    blocks: ['filters', 'table'],
    density: 'comfortable',
    layout: 'directory',
  },
  {
    id: 'detail',
    name: 'Record details',
    description: 'Fields of one bound record. Layout sections come from the module.',
    blocks: ['details'],
    density: 'comfortable',
    layout: 'detail',
  },
]

export function grammarById(id: string) {
  return kernelGrammars.find(grammar => grammar.id === id)
}

export function grammarCatalog() {
  return kernelGrammars.map(grammar => ({ ...grammar }))
}

export function isGrammarId(value: string): value is GrammarId {
  return kernelGrammars.some(grammar => grammar.id === value)
}

export function isWorkingGrammar(value: string): value is WorkingGrammar {
  return (workingGrammars as readonly string[]).includes(value)
}

export function resolveViewGrammar(view: { id: string; grammar?: string | null }): WorkingGrammar {
  if (view.grammar && isWorkingGrammar(view.grammar)) return view.grammar
  if (view.id === 'overview') return 'overview'
  if (view.id === 'board' || view.id === 'pipeline') return 'board'
  if (view.id === 'active') return 'directory'
  return 'ledger'
}

export function grammarFromLegacyKind(kind: string, view?: string): GrammarId {
  if (kind === 'detail' || kind === 'directory') return kind
  if (kind === 'queue') return view === 'board' ? 'board' : 'ledger'
  if (isGrammarId(kind)) return kind
  throw new Error(`Unknown surface grammar: ${kind}.`)
}
