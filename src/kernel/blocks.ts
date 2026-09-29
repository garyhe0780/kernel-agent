/** Closed catalog of generic blocks. Blocks take a data binding; they do not carry business meaning. */

import { grammarById, type GrammarId } from './grammars'
import { InputError } from './errors'

export type BlockBinding = 'view' | 'record'
export type SurfaceKind = GrammarId

export type KernelBlock = {
  id: string
  name: string
  description: string
  binding: BlockBinding
  wired: boolean
}

export const kernelBlocks: KernelBlock[] = [
  {
    id: 'filters',
    name: 'Filters',
    description: 'Narrow a bound view. The same filters block can sit on purchase requests or opportunities.',
    binding: 'view',
    wired: true,
  },
  {
    id: 'table',
    name: 'Table',
    description: 'Rows of a bound view. Columns and sort come from the view; the table does not name the business.',
    binding: 'view',
    wired: true,
  },
  {
    id: 'details',
    name: 'Record card',
    description: 'Fields of one bound record. Layout sections come from the module; the card does not.',
    binding: 'record',
    wired: true,
  },
  {
    id: 'board',
    name: 'Board',
    description: 'Columns of a bound view grouped by status. The same board can sit on issues or opportunities.',
    binding: 'view',
    wired: true,
  },
  {
    id: 'stats',
    name: 'Stats',
    description: 'Record counts, status totals, integer sums, and a created-this-week trend from a bound view. Uses $createdAt; Kernel has no date field type.',
    binding: 'view',
    wired: true,
  },
  {
    id: 'chart',
    name: 'Chart',
    description: 'Status breakdown of a bound view. The chart reads aggregates already computed from records; it does not run SQL.',
    binding: 'view',
    wired: true,
  },
  {
    id: 'chat',
    name: 'Chat room',
    description: 'A conversation bound to a record. Kernel has no chat runtime yet.',
    binding: 'record',
    wired: false,
  },
  {
    id: 'email.compose',
    name: 'Email compose',
    description: 'Write a message using bound record fields. Kernel does not send email yet.',
    binding: 'record',
    wired: false,
  },
  {
    id: 'email.inbox',
    name: 'Email inbox',
    description: 'A list of messages bound to a view. Kernel has no mail runtime yet.',
    binding: 'view',
    wired: false,
  },
]

export function blockById(id: string) {
  return kernelBlocks.find(block => block.id === id)
}

export function blockCatalog() {
  return kernelBlocks.map(block => ({ ...block }))
}

export function composeSurface(grammar: GrammarId) {
  const spec = grammarById(grammar)
  if (!spec) throw new InputError(`Unknown grammar: ${grammar}.`)
  return spec.blocks.map(id => {
    const block = blockById(id)
    if (!block?.wired) throw new InputError(`Grammar ${grammar} cannot use unwired block ${id}.`)
    return block
  })
}
