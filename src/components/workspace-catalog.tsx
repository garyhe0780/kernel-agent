import { Link } from '@tanstack/react-router'
import { blockById, blockCatalog } from '@/kernel/blocks'
import { grammarCatalog } from '@/kernel/grammars'
import { catalogSnapshot } from '@/kernel/modules'
import { patternCatalog } from '@/kernel/patterns'
import { useWorkspaceSnapshot } from './workspace-layout'

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

export function WorkspaceCatalog() {
  const snapshot = useWorkspaceSnapshot()
  const owner = snapshot.principal.role === 'owner'
  const blocks = blockCatalog()
  const grammars = grammarCatalog()
  const modules = catalogSnapshot()
  const patterns = patternCatalog()
  return (
    <main className="main" id="main-content" tabIndex={-1}>
      <header className="main-header">
        <div>
          <h1>Catalog</h1>
          <p>One catalog: blocks, grammars, modules, and patterns. Blocks take a data binding. Grammars choose the working design. Modules carry the business meaning. Patterns name a typical application.</p>
        </div>
      </header>
      <div className="main-body workspace-home-body">
        <section className="catalog-list" aria-label="Catalog blocks">
          <h2>Blocks</h2>
          {blocks.map(block => (
            <article className="catalog-module" key={block.id}>
              <div className="catalog-module-heading">
                <div>
                  <h3>{block.name}</h3>
                  <p className="muted"><code>{block.id}</code> · {bindingLabel(block.binding)}</p>
                </div>
                <p className="muted">{block.wired ? 'Wired to a grammar' : 'Listed · Kernel does not run this yet'}</p>
              </div>
              <p>{block.description}</p>
            </article>
          ))}
        </section>
        <section className="catalog-list" aria-label="Catalog grammars">
          <h2>Grammars</h2>
          {grammars.map(grammar => (
            <article className="catalog-module" key={grammar.id}>
              <div className="catalog-module-heading">
                <div>
                  <h3>{grammar.name}</h3>
                  <p className="muted"><code>{grammar.id}</code> · {grammar.density} · {grammar.layout}</p>
                </div>
              </div>
              <p>{grammar.description}</p>
              <p className="muted">{grammar.blocks.map(id => blockById(id)?.name ?? id).join(' + ')}</p>
            </article>
          ))}
        </section>
        <section className="catalog-list" aria-label="Catalog modules">
          <h2>Modules</h2>
          {modules.map(mod => (
            <article className="catalog-module" key={mod.id}>
              <div className="catalog-module-heading">
                <div>
                  <h3>{mod.name}</h3>
                  <p className="muted"><code>{mod.id}</code> · alias {mod.defaultAlias}</p>
                </div>
                {owner ? <Link className="button button-outline" to="/applications" search={{ assemble: mod.id }}>Use in a new application</Link> : null}
              </div>
              <p>{mod.description}</p>
              {mod.ports.length ? (
                <div>
                  <h4>Ports</h4>
                  <ul>
                    {mod.ports.map(port => (
                      <li key={port.field}>
                        {port.label} → <code>{port.target}</code>
                        {port.required === false ? ' · optional' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="muted">No required links. Other modules can point here.</p>}
              <div>
                <h4>Actions</h4>
                <ul>
                  {mod.actions.map(action => <li key={action.name}><strong>{action.label}</strong> {action.description}</li>)}
                </ul>
              </div>
              <div>
                <h4>Bound blocks</h4>
                <ul>
                  {mod.surfaces.map(surface => <li key={`${surface.grammar}:${surface.name}`}>{surface.grammar} · {surfaceLine(surface)}</li>)}
                </ul>
              </div>
              {Object.keys(mod.settings).length ? (
                <div>
                  <h4>Settings</h4>
                  <ul>
                    {Object.entries(mod.settings).map(([key, value]) => <li key={key}>{settingLabel(key)}: {settingValue(key, value)}</li>)}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </section>
        <section className="catalog-list" aria-label="Catalog patterns">
          <h2>Patterns</h2>
          {patterns.map(pattern => (
            <article className="catalog-module" key={pattern.id}>
              <div className="catalog-module-heading">
                <div>
                  <h3>{pattern.name}</h3>
                  <p className="muted"><code>{pattern.id}</code> · {pattern.shell} shell · home {pattern.home}</p>
                </div>
                {owner ? <Link className="button button-outline" to="/applications" search={{ pattern: pattern.id }}>Use this pattern</Link> : null}
              </div>
              <p>{pattern.description}</p>
              <div>
                <h4>Modules</h4>
                <ul>{pattern.modules.map(item => <li key={item.as}><code>{item.use}</code> as {item.as}</li>)}</ul>
              </div>
              <div>
                <h4>Surfaces</h4>
                <ul>{pattern.surfaces.map(surface => <li key={`${surface.grammar}:${surface.of}:${surface.view ?? 'detail'}`}>{surface.grammar} · {surfaceLine({ name: surface.name ?? surface.of, blocks: surface.blocks })}</li>)}</ul>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
