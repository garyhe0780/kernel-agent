import { AgentAccessPanel } from './agent-access'
import { ActionReviewTest } from './action-review-test'
import { ApplicationStudio } from './application-studio'
import type { Draft } from '@/kernel/application'
import type { Definition, Field as DefinitionField } from '@/kernel/definition'
import type { MigrationReport } from '@/kernel/migration'
import { Fragment, useState } from 'react'
import { ArrowRight, ChevronDown, Search, PencilLine } from 'lucide-react'
import { Link, Navigate } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Empty, Spinner, Switch, ToggleGroup } from '@/components/ui/surfaces'
import { packageBySlug } from '@/kernel/packages'
import { date, money, request, shortId } from '@/lib/client'
import { capabilityOf, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

function fieldType(field: DefinitionField) {
  if (field.reference) return 'Relationship'
  if (field.format === 'date') return 'Date'
  if (field.format === 'user') return 'Person'
  if (field.format === 'percent') return 'Percentage'
  return { string: 'Text', integer: 'Whole number', boolean: 'Yes / no', enum: 'Choice' }[field.type]
}

function FieldReference({ field, definitions }: { field: DefinitionField; definitions: Definition[] }) {
  const reference = definitions.find(item => item.slug === field.reference || item.entity.name === field.reference)
  const hasDetails = Boolean(field.options?.length || field.closed?.length || field.default !== undefined || field.min !== undefined || field.max !== undefined || field.reference || field.referenceMatch)
  if (!hasDetails) return null
  return <details className="config-field-details">
    <summary>{field.reference ? `Links to ${reference?.entity.label ?? field.reference}` : field.options?.length ? `${field.options.length} choices` : 'Field details'}<ChevronDown aria-hidden="true" /></summary>
    <dl>
      {field.options?.length ? <><dt>Choices</dt><dd>{field.options.join(', ')}</dd></> : null}
      {field.closed?.length ? <><dt>Closed states</dt><dd>{field.closed.join(', ')}</dd></> : null}
      {field.default !== undefined ? <><dt>Default</dt><dd>{field.default === '' ? 'Empty text' : String(field.default)}</dd></> : null}
      {field.min !== undefined ? <><dt>{field.type === 'string' ? 'Minimum length' : 'Minimum'}</dt><dd>{field.min}{field.type === 'string' ? ' characters' : ''}</dd></> : null}
      {field.max !== undefined ? <><dt>{field.type === 'string' ? 'Maximum length' : 'Maximum'}</dt><dd>{field.max}{field.type === 'string' ? ' characters' : ''}</dd></> : null}
      {field.reference ? <><dt>Relationship</dt><dd>{reference?.entity.label ?? field.reference}</dd></> : null}
      {field.referenceMatch ? <><dt>Match</dt><dd>{field.referenceMatch.sourceField} → {field.referenceMatch.targetField}</dd></> : null}
    </dl>
  </details>
}

function FieldTable({ fields, definitions, label }: { fields: Record<string, DefinitionField>; definitions: Definition[]; label: string }) {
  return <table className="config-field-table">
    <caption className="sr-only">{label}</caption>
    <thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Rules</th></tr></thead>
    <tbody>{Object.entries(fields).map(([key, field]) => <tr key={key}>
      <th scope="row"><span>{field.label}</span><FieldReference field={field} definitions={definitions} /></th>
      <td>{fieldType(field)}</td>
      <td><span>{field.required ? 'Required' : 'Optional'}</span><span className="config-field-access">{field.editable ? 'Editable' : 'Action-managed'}</span></td>
    </tr>)}</tbody>
  </table>
}

function ActionRules({ definition, definitions }: { definition: Definition; definitions: Definition[] }) {
  function rules(items: Definition['actions'][number]['policies']) {
    return items.length ? <ul className="config-rule-list">{items.map(rule => <li key={rule.id}>
      {rule.label}
      {rule.setting ? <span className="muted"> · {settingLabel(rule.setting)}: {typeof definition.settings[rule.setting] === 'number' && rule.field.endsWith('Cents') ? money(definition.settings[rule.setting]) : String(definition.settings[rule.setting] ?? 'Not set')}</span> : null}
      {rule.enabledBy ? <span className="muted"> · {definition.settings[rule.enabledBy] ? 'Enabled' : 'Disabled'} by {settingLabel(rule.enabledBy)}</span> : null}
    </li>)}</ul> : <p className="muted">None</p>
  }
  return <section className="config-actions" aria-labelledby="config-actions-title">
    <header className="config-section-heading"><h3 id="config-actions-title">Actions & rules <span>{definition.actions.length}</span></h3><p>Open an action to inspect how it works.</p></header>
    <div className="config-action-list">{definition.actions.map(action => <details className="config-action" key={action.name}>
      <summary><span className="config-action-summary"><strong>{action.label}</strong><span>{action.preconditions.map(rule => rule.label).join(' · ') || 'No preconditions'}{action.effects.status !== undefined ? <><ArrowRight aria-hidden="true" />{String(action.effects.status)}</> : null}</span></span><ChevronDown aria-hidden="true" /></summary>
      <div className="config-action-body">
        <p>{action.description}</p>
        <dl className="config-action-meta"><dt>Allowed roles</dt><dd>{action.roles.join(', ')}</dd><dt>Human execution</dt><dd>{action.humanExecution === 'direct' ? 'Direct action' : 'Review required'}</dd></dl>
        <h4>Preconditions</h4>{rules(action.preconditions)}
        <h4>Policies</h4>{rules(action.policies)}
        <h4>Inputs</h4>{Object.keys(action.input).length ? <FieldTable fields={action.input} definitions={definitions} label={`${action.label} inputs`} /> : <p className="muted">No inputs required.</p>}
        <h4>Changes made</h4>
        {Object.keys(action.effects).length ? <dl className="config-effect-list">{Object.entries(action.effects).map(([key, value]) => <Fragment key={key}><dt>{definition.entity.fields[key]?.label ?? settingLabel(key)}</dt><dd>{typeof value === 'string' && value.startsWith('$input.') ? `From ${action.input[value.slice(7)]?.label ?? value.slice(7)}` : value === '' ? 'Cleared' : String(value)}</dd></Fragment>)}</dl> : <p className="muted">No field changes.</p>}
      </div>
    </details>)}</div>
  </section>
}

function EntityConfiguration({ definition, definitions, options, activeSlug, onChange }: { definition: Definition; definitions: Definition[]; options: { value: string; label: string }[]; activeSlug: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState('')
  const fields = Object.fromEntries(Object.entries(definition.entity.fields).filter(([key, field]) => `${field.label} ${key} ${fieldType(field)}`.toLowerCase().includes(query.trim().toLowerCase())))
  return <div className="config-entities">
    {options.length > 1 ? <div className="config-entity-selector"><span>Entity</span><ToggleGroup label="Entity" value={activeSlug} onChange={onChange} options={options} /></div> : null}
    <header className="config-entity-heading"><h2>{definition.entity.label}</h2><p>{definition.description}</p></header>
    <div className="config-definition-grid">
      <section className="config-fields" aria-labelledby="config-fields-title">
        <header className="config-section-heading"><h3 id="config-fields-title">Fields <span>{Object.keys(definition.entity.fields).length}</span></h3><p>Published structure and validation.</p></header>
        <div className="config-fields-toolbar"><Search aria-hidden="true" /><Field aria-label={`Search ${definition.entity.label.toLowerCase()} fields`} value={query} onChange={setQuery} type="search"><Input placeholder="Search fields…" /></Field><span aria-live="polite">{Object.keys(fields).length} fields</span></div>
        {Object.keys(fields).length ? <FieldTable fields={fields} definitions={definitions} label={`${definition.entity.label} fields`} /> : <Empty title="No matching fields"><p>Try a field name or type.</p><Button variant="outline" onPress={() => setQuery('')}>Clear search</Button></Empty>}
        <p className="config-field-note">Action-managed fields are updated through defined actions.</p>
      </section>
      <ActionRules definition={definition} definitions={definitions} />
    </div>
  </div>
}

function settingLabel(key: string) {
  const base = key.endsWith('Cents') ? key.slice(0, -5) : key
  const words = base.replace(/([a-z])([A-Z])/g, '$1 $2')
  const label = words.charAt(0).toUpperCase() + words.slice(1)
  return key.endsWith('Cents') ? `${label} (USD)` : label
}

function displaySettings(settings: Definition['settings']) {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, key.endsWith('Cents') && typeof value === 'number' ? value / 100 : value]))
}

function storedSettings(draft: Record<string, string | number | boolean>, published: Definition['settings']) {
  return Object.fromEntries(Object.entries(published).map(([key, current]) => {
    const value = draft[key]
    if (typeof current === 'boolean') return [key, Boolean(value)]
    if (typeof current === 'number') return [key, Math.round(Number(key.endsWith('Cents') ? Number(value) * 100 : value))]
    return [key, String(value ?? '')]
  }))
}

export function CapabilitySettings({ capability, busy, onPublish }: { capability: { slug: string; version: number; definition: Definition }; busy: boolean; onPublish: (settings: Record<string, string | number | boolean>) => Promise<void> }) {
  const [draft, setDraft] = useState(() => displaySettings(capability.definition.settings))
  const entries = Object.entries(draft)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Publishing creates a new definition version. Existing proposals cannot silently adopt it.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {entries.map(([key, value]) => typeof value === 'boolean' ? (
            <Switch key={key} label={settingLabel(key)} checked={value} onChange={checked => setDraft(current => ({ ...current, [key]: checked }))} />
          ) : (
            <Field key={key} type={typeof capability.definition.settings[key] === 'number' ? 'number' : 'text'} value={String(value)} isDisabled={busy} onChange={next => setDraft(current => ({ ...current, [key]: typeof capability.definition.settings[key] === 'number' ? Number(next) : next }))}>
              <FieldLabel>{settingLabel(key)}</FieldLabel>
              <Input step={key.endsWith('Cents') ? '0.01' : typeof capability.definition.settings[key] === 'number' ? '1' : undefined} />
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button disabled={busy} onPress={() => onPublish(storedSettings(draft, capability.definition.settings))}>{busy ? <Spinner data-icon="inline-start" /> : null}Publish version {capability.version + 1}</Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectBuild({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, loadMore } = useProject(projectSlug)
  const [packageSlug, setPackageSlug] = useState<string>()
  const [editing, setEditing] = useState<{ draft: Draft; model: { configured: boolean; model: string | null } }>()
  const [history, setHistory] = useState<{ version: number; createdAt: string; migration: Partial<MigrationReport> }[]>()
  const [tab, setTab] = useState('packages')
  const [agentTab, setAgentTab] = useState('connect')
  const activeSlug = packageSlug ?? snapshot?.capabilities[0]?.slug
  const activeCapability = snapshot && activeSlug ? capabilityOf(snapshot, activeSlug) : undefined

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><h1>Configuration could not be loaded</h1><Alert variant="danger">{error}</Alert><Button disabled={busy} onPress={() => void run('Configuration loaded.', async () => { await refresh() })}>{busy ? <Spinner data-icon="inline-start" /> : null}Try again</Button><p><Link to="/workspace">Back to applications</Link></p></main>
      : <LoadingShell />
  }

  if (snapshot.principal.role !== 'owner') {
    return <Navigate to="/p/$projectSlug" params={{ projectSlug }} />
  }

  const definition = (activeSlug ? capabilityOf(snapshot, activeSlug) : snapshot.capability)?.definition ?? snapshot.capability.definition
  const packageOptions = snapshot.capabilities.map(item => ({ value: item.slug, label: item.definition.name }))

  return (
    <>
      <Toaster position="top-right" />
      <ProjectFrame snapshot={snapshot} liveHref={snapshot.project?.shell === 'site' ? `/s/${snapshot.workspace.id}` : undefined} configure>
        <main className="main config-page" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>Configure {snapshot.project?.name}</h1>
              <p>{snapshot.project?.editable ? `Published version ${snapshot.project.version} · Inspect fields, actions, and policies.` : 'Packages, policies, and execution history.'}</p>
            </div>
            {snapshot.project?.editable && !editing ? <Button disabled={busy} onPress={() => run('Application draft opened.', async () => setEditing(await request('/api/kernel', { type: 'edit_project', project: projectSlug })))}>{busy ? <Spinner data-icon="inline-start" /> : <PencilLine data-icon="inline-start" />}Change application</Button> : null}
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {editing ? <ApplicationStudio key={editing.draft.id} draft={editing.draft} model={editing.model} onSaved={draft => setEditing(current => current ? { ...current, draft } : current)} onClose={() => setEditing(undefined)} /> : <>
            <div className="config-content">
              <Tabs
                label="Configure"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'policies', label: snapshot.project?.editable ? 'Application' : 'Policies', panel: snapshot.project?.editable ? (
                    <Card className="config-overview">
                      <CardHeader>
                        <CardTitle>Application overview</CardTitle>
                        <CardDescription>Use Change application to edit fields and policies. Preview the effect on existing records before publishing a new version.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <dl className="kv">
                          <dt>Published version</dt>
                          <dd>{snapshot.project.version}</dd>
                          <dt>Entities</dt>
                          <dd>{snapshot.capabilities.map(cap => cap.definition.entity.label).join(', ')}</dd>
                          <dt>Agent actions</dt>
                          <dd>Review is the default. Owners can grant automatic execution for selected operations in Agents.</dd>
                        </dl>
                        <h3>Current policies</h3>
                        {!snapshot.capabilities.some(cap => cap.definition.actions.some(action => action.policies.length)) ? <p className="muted">No additional policies are defined. Action preconditions and allowed roles still apply; inspect them in Entities.</p> : null}
                        {snapshot.capabilities.filter(cap => cap.definition.actions.some(action => action.policies.length)).map(cap => <div key={cap.slug}><strong>{cap.definition.name}</strong><ul>{cap.definition.actions.flatMap(action => action.policies.map(rule => <li key={`${action.name}-${rule.id}`}>{action.label}: {rule.label}{rule.setting && typeof cap.definition.settings[rule.setting] === 'number' ? ` · ${rule.field.endsWith('Cents') ? money(cap.definition.settings[rule.setting]) : cap.definition.settings[rule.setting]}` : ''}</li>))}</ul></div>)}
                      </CardContent>
                    </Card>
                  ) : <div className="config-policy-settings">
                    {packageOptions.length > 1 ? <ToggleGroup label="Entity" value={activeSlug ?? packageOptions[0].value} onChange={setPackageSlug} options={packageOptions} /> : null}
                    {activeCapability && Object.keys(activeCapability.definition.settings).length ? (
                    <CapabilitySettings
                      key={`${activeCapability.slug}:${activeCapability.version}`}
                      capability={activeCapability}
                      busy={busy}
                      onPublish={async settings => {
                        await run('Published a new capability version.', async () => {
                          await request('/api/kernel', { type: 'publish_settings', capability: activeCapability.slug, expectedVersion: activeCapability.version, settings })
                          await refresh()
                        })
                      }}
                    />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No policy settings</CardTitle>
                        <CardDescription>
                          {packageBySlug(activeSlug ?? definition.slug)?.view === 'none'
                            ? 'This package has no configurable settings. Lifecycle changes are staged actions; a human apply commits them.'
                            : `Visibility is the publish action on each page or note. View: ${packageBySlug(activeSlug ?? definition.slug)?.view ?? 'none'}.`}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}</div> },
                  { id: 'packages', label: 'Entities', panel: (
                    <EntityConfiguration key={activeSlug} definition={definition} definitions={snapshot.capabilities.map(cap => cap.definition)} options={packageOptions} activeSlug={activeSlug ?? definition.slug} onChange={setPackageSlug} />
                  ) },
                  ...(snapshot.project?.editable ? [{ id: 'versions', label: 'Versions', panel: <Card><CardHeader><CardTitle>Published application versions</CardTitle><CardDescription>Definitions and migration summaries are retained for review. Restoring an older version is not supported yet.</CardDescription></CardHeader><CardContent><Button variant="outline" disabled={busy} onPress={() => run('Version history loaded.', async () => setHistory(await request(`/api/kernel?history=${encodeURIComponent(projectSlug)}`)))}>Load version history</Button>{history?.map(item => <div className="migration-change" key={item.version}><strong>Version {item.version}</strong><p className="muted">{date(item.createdAt)}</p><p>{item.version === 1 ? 'Initial publication' : `${item.migration.updatedRecordCount ?? 0} records updated · ${item.migration.changes?.length ?? 0} definition changes`}</p>{item.migration.changes?.length ? <details><summary>Definition changes</summary>{item.migration.changes.map((change, i) => <div key={i}><strong>{change.entity} · {change.label}</strong><p>Before: {change.before}</p><p>After: {change.after}</p></div>)}</details> : null}</div>)}</CardContent></Card> }] : []),
                  { id: 'agents', label: 'Agents', panel: <div className="config-agents"><Tabs label="Agent setup" value={agentTab} onChange={setAgentTab} tabs={[
                    { id: 'connect', label: 'Connections & permissions', panel: <AgentAccessPanel key={projectSlug} project={projectSlug} capabilities={snapshot.capabilities} allowCreation={Boolean(snapshot.project?.editable)} /> },
                    { id: 'test', label: 'Test action review', panel: <ActionReviewTest snapshot={snapshot} onChange={refresh} onLoadMore={loadMore} /> },
                  ]} /></div> },
                  { id: 'activity', label: 'Activity', panel: (
                    <Card>
                      <CardHeader>
                        <CardTitle>Execution history</CardTitle>
                        <CardDescription>Every successful transition leaves an attributable event.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {snapshot.executions.length === 0 ? <Empty title="No activity yet." /> : (
                          <div className="timeline">
                            {snapshot.executions.map(event => (
                              <div className="timeline-item" key={event.id}>
                                <span className="muted timeline-time">{date(event.createdAt)}</span>
                                <div>
                                  <strong>{event.action}</strong>
                                  <div className="muted">{event.actorName} · {event.actorKind}{event.recordId ? ` · ${shortId(event.recordId)}` : ''}</div>
                                </div>
                                <Badge variant={statusVariant(event.outcome)}>{event.outcome}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) },
                ]}
              />
            </div>
            </>}
          </div>
        </main>
      </ProjectFrame>
    </>
  )
}
