import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Blocks, Boxes, ChartColumn, Check, ChevronRight, Columns3, FileText, LayoutDashboard, ListFilter, Mail, MessageSquare, Search, Table2, X, type LucideIcon } from 'lucide-react'
import { blockById, blockCatalog } from '@/kernel/blocks'
import { grammarCatalog } from '@/kernel/grammars'
import { catalogSnapshot } from '@/kernel/modules'
import { patternCatalog } from '@/kernel/patterns'
import { useWorkspaceSnapshot } from './workspace-layout'
import { Tabs } from './ui/tabs'
import { CatalogPreview } from './catalog-preview'

function settingLabel(key: string) {
  if (key === 'requireVerifiedSupplier') return 'Require a verified supplier'
  if (key === 'approvalLimitCents') return 'Approval ceiling (USD)'
  return key
}

function settingValue(key: string, value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key.endsWith('Cents') && typeof value === 'number') return `$${(value / 100).toFixed(value % 100 ? 2 : 0)}`
  return String(value)
}

function bindingLabel(binding: 'view' | 'record') {
  return binding === 'view' ? 'Binds to a saved view' : 'Binds to a record'
}

function surfaceLine(surface: { name?: string; blocks: string[] }) {
  const names = surface.blocks.map(id => blockById(id)?.name ?? id).join(' + ')
  return `${names} bound to ${surface.name ?? 'this record'}`
}


const blocks = blockCatalog()
const grammars = grammarCatalog()
const modules = catalogSnapshot()
const patterns = patternCatalog()
const categories = [
  { id: 'blocks', name: 'Blocks', description: 'Reusable interface elements. Bind a block to a saved view or a record.', items: blocks },
  { id: 'grammars', name: 'Grammars', description: 'Working designs that bring blocks together into a layout.', items: grammars },
  { id: 'modules', name: 'Modules', description: 'Business capabilities, with actions, links, and bound surfaces.', items: modules },
  { id: 'patterns', name: 'Patterns', description: 'Typical applications assembled from modules and working designs.', items: patterns },
] as const
const icons: Record<string, LucideIcon> = { filters: ListFilter, table: Table2, details: FileText, detail: FileText, board: Columns3, stats: LayoutDashboard, overview: LayoutDashboard, chart: ChartColumn, chat: MessageSquare, 'email.compose': Mail, 'email.inbox': Mail, ledger: Table2, directory: Table2 }
type Category = typeof categories[number]

export function WorkspaceCatalog() {
  const snapshot = useWorkspaceSnapshot()
  return <CatalogWorkbench owner={snapshot.principal.role === 'owner'} />
}

export function CatalogWorkbench({ owner }: { owner: boolean }) {
  const [category, setCategory] = useState('blocks')
  return <main className="main catalog-workbench" id="main-content" tabIndex={-1}>
    <header className="main-header"><div><h1>Catalog</h1><p>Explore the building blocks of your next application.</p></div><span className="catalog-header-note"><Blocks size={15} /> Built to work together</span></header>
    <Tabs label="Catalog categories" value={category} onChange={setCategory} tabs={categories.map(item => ({ id: item.id, label: <><span>{item.name}</span><span className="catalog-tab-count">{item.items.length}</span></>, panel: <CatalogBrowser key={item.id} category={item} owner={owner} /> }))} />
  </main>
}

function CatalogBrowser({ category, owner }: { category: Category; owner: boolean }) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(category.id === 'blocks' ? 'table' : category.items[0]?.id ?? '')
  const items = category.items.filter(item => `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selected = items.find(item => item.id === selection) ?? items[0]
  return <div className="catalog-browser">
    <aside className="catalog-index" aria-label={`${category.name} index`}>
      <label className="catalog-search"><Search size={16} /><span className="sr-only">Search {category.name.toLowerCase()}</span><input type="search" aria-label={`Search ${category.name.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${category.name.toLowerCase()}…`} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
      <div className="catalog-index-caption"><span>{category.name}</span><span aria-live="polite">{items.length}</span></div>
      <div className="catalog-index-list">{items.map(item => { const Icon = icons[item.id] ?? (category.id === 'patterns' ? LayoutDashboard : Boxes); const planned = 'wired' in item && !item.wired; return <button type="button" className="catalog-index-item" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => setSelection(item.id)}><Icon size={18} /><span><strong>{item.name}</strong><small>{planned ? 'No runtime yet' : category.id === 'blocks' && 'binding' in item ? item.binding === 'view' ? 'Saved view' : 'Record' : item.id}</small></span><ChevronRight size={14} /></button> })}</div>
      <p className="catalog-index-help">{category.description}</p>
    </aside>
    {selected ? <CatalogDetail key={`${category.id}:${selected.id}`} category={category.id} id={selected.id} owner={owner} /> : <div className="catalog-empty" role="status"><Search size={28} /><h2>No matching {category.name.toLowerCase()}</h2><p>Try another name or a term from the description.</p><button type="button" className="button button-outline" onClick={() => setQuery('')}>Clear search</button></div>}
  </div>
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="catalog-detail-section"><h3>{title}</h3>{children}</section>
}

function CatalogDetail({ category, id, owner }: { category: string; id: string; owner: boolean }) {
  const block = category === 'blocks' ? blocks.find(item => item.id === id) : undefined
  const grammar = category === 'grammars' ? grammars.find(item => item.id === id) : undefined
  const mod = category === 'modules' ? modules.find(item => item.id === id) : undefined
  const pattern = category === 'patterns' ? patterns.find(item => item.id === id) : undefined
  const item = block ?? grammar ?? mod ?? pattern
  if (!item) return null
  const Icon = icons[id] ?? (pattern ? LayoutDashboard : Boxes)
  const preview = block?.id ?? grammar?.id
  return <article className="catalog-detail" aria-label={`${item.name} details`}>
    <div className="catalog-detail-heading"><div><h2><Icon size={22} />{item.name}</h2><code>{item.id}</code></div>{block && <span className="catalog-runtime" data-ready={block.wired}>{block.wired && <Check size={13} />}{block.wired ? 'Wired to a grammar' : 'No runtime yet'}</span>}{owner && mod && <Link className="button button-primary" to="/applications" search={{ assemble: mod.id }}>Use in a new application <ArrowRight size={14} /></Link>}{owner && pattern && <Link className="button button-primary" to="/applications" search={{ pattern: pattern.id }}>Use this pattern <ArrowRight size={14} /></Link>}</div>
    {preview && <figure className="catalog-preview"><figcaption><span>Preview</span><span>{block && !block.wired ? 'Not implemented' : 'Illustrative · sample data'}</span></figcaption><div className="catalog-preview-stage"><CatalogPreview kind={preview} planned={block ? !block.wired : false} /></div>{grammar && <div className="catalog-preview-composition">{grammar.blocks.map(blockId => <span key={blockId}>{blockById(blockId)?.name ?? blockId}</span>)}</div>}</figure>}
    <p className="catalog-description">{item.description}</p>
    {block && <><div className="catalog-properties"><div><span>Data binding</span><strong>{bindingLabel(block.binding)}</strong></div><div><span>Runtime</span><strong>{block.wired ? 'Available in working designs' : 'Listed only · not implemented'}</strong></div></div><DetailSection title="Used in grammars">{grammars.filter(value => value.blocks.includes(block.id)).length ? <div className="catalog-related">{grammars.filter(value => value.blocks.includes(block.id)).map(value => <div key={value.id}><strong>{value.name}</strong><span>{value.density} · {value.layout}</span></div>)}</div> : <p className="muted">This block is not used by a working grammar yet.</p>}</DetailSection></>}
    {grammar && <div className="catalog-properties"><div><span>Density</span><strong>{grammar.density}</strong></div><div><span>Layout</span><strong>{grammar.layout}</strong></div><div><span>Composition</span><strong>{grammar.blocks.map(value => blockById(value)?.name ?? value).join(' + ')}</strong></div></div>}
    {mod && <><div className="catalog-properties"><div><span>Default alias</span><strong><code>{mod.defaultAlias}</code></strong></div><div><span>Composition</span><strong>{mod.actions.length} actions · {mod.surfaces.length} surfaces</strong></div></div><DetailSection title="Ports">{mod.ports.length ? <ul>{mod.ports.map(port => <li key={port.field}>{port.label} → <code>{port.target}</code>{port.required === false ? ' · optional' : ''}</li>)}</ul> : <p className="muted">No required links. Other modules can point here.</p>}</DetailSection><DetailSection title="Actions"><ul className="catalog-action-list">{mod.actions.map(action => <li key={action.name}><strong>{action.label}</strong><span>{action.description}</span></li>)}</ul></DetailSection><DetailSection title="Bound blocks"><ul>{mod.surfaces.map(surface => <li key={`${surface.grammar}:${surface.name}`}><strong>{surface.grammar}</strong> · {surfaceLine(surface)}</li>)}</ul></DetailSection>{Object.keys(mod.settings).length > 0 && <DetailSection title="Settings"><dl className="catalog-settings">{Object.entries(mod.settings).map(([key, value]) => <div key={key}><dt>{settingLabel(key)}</dt><dd>{settingValue(key, value)}</dd></div>)}</dl></DetailSection>}</>}
    {pattern && <><div className="catalog-properties"><div><span>Application shell</span><strong>{pattern.shell}</strong></div><div><span>Home surface</span><strong>{pattern.home}</strong></div></div><DetailSection title="Modules"><div className="catalog-related">{pattern.modules.map(value => <div key={value.as}><strong>{modules.find(mod => mod.id === value.use)?.name ?? value.use}</strong><span><code>{value.use}</code> as {value.as}</span></div>)}</div></DetailSection><DetailSection title="Surfaces"><ul>{pattern.surfaces.map(surface => <li key={`${surface.grammar}:${surface.of}:${surface.view ?? 'detail'}`}><strong>{surface.grammar}</strong> · {surfaceLine({ name: surface.name ?? surface.of, blocks: surface.blocks })}</li>)}</ul></DetailSection></>}
  </article>
}
