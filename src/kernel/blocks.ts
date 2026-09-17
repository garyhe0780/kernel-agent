/** Closed catalog of generic blocks. Blocks take a data binding; they do not carry business meaning. */

export type BlockBinding = 'view' | 'record'
export type SurfaceKind = 'queue' | 'directory' | 'detail'

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
    id: 'chart',
    name: 'Chart',
    description: 'A bound view drawn as a chart. Kernel has no chart runtime yet.',
    binding: 'view',
    wired: false,
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

const surfaceBlocks: Record<SurfaceKind, string[]> = {
  queue: ['filters', 'table'],
  directory: ['filters', 'table'],
  detail: ['details'],
}

export function blockById(id: string) {
  return kernelBlocks.find(block => block.id === id)
}

export function blockCatalog() {
  return kernelBlocks.map(block => ({ ...block }))
}

export function composeSurface(kind: SurfaceKind) {
  return surfaceBlocks[kind].map(id => {
    const block = blockById(id)
    if (!block?.wired) throw new Error(`Surface ${kind} cannot use unwired block ${id}.`)
    return block
  })
}
