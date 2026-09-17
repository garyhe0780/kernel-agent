import { Link } from '@tanstack/react-router'
import { blockById, blockCatalog } from '@/kernel/blocks'
import { catalogSnapshot } from '@/kernel/modules'
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

function surfaceLine(surface: { name: string; blocks: string[] }) {
  const names = surface.blocks.map(id => blockById(id)?.name ?? id).join(' + ')
  return `${names} bound to ${surface.name}`
}

export function WorkspaceCatalog() {
  const snapshot = useWorkspaceSnapshot()
  const owner = snapshot.principal.role === 'owner'
  const blocks = blockCatalog()
  const modules = catalogSnapshot()
  return (
    <main className="main" id="main-content" tabIndex={-1}>
      <header className="main-header">
        <div>
          <h1>Catalog</h1>
          <p>Blocks are generic and take a data binding. Modules carry the business meaning. The same table can show purchase requests or opportunities.</p>
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
                <p className="muted">{block.wired ? 'Wired to today’s queues and record details' : 'Listed · Kernel does not run this yet'}</p>
              </div>
              <p>{block.description}</p>
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
                    {mod.ports.map(port => <li key={port.field}>{port.label} → <code>{port.target}</code></li>)}
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
                  {mod.surfaces.map(surface => <li key={`${surface.kind}:${surface.name}`}>{surfaceLine(surface)}</li>)}
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
      </div>
    </main>
  )
}
