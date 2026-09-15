import { AgentAccessPanel } from './agent-access'
import { ApplicationStudio } from './application-studio'
import type { Draft } from '@/kernel/application'
import type { MigrationReport } from '@/kernel/migration'
import { Fragment, useEffect, useState } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { LoadingShell, ProjectFrame } from '@/components/project-frame'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Empty, Spinner, Switch, ToggleGroup } from '@/components/ui/surfaces'
import { packageBySlug } from '@/kernel/packages'
import { date, money, request, shortId, type ActionResult } from '@/lib/client'
import { capabilityOf, chooseSimulation, idempotencyKey, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

export function ProjectBuild({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, keys } = useProject(projectSlug)
  const [packageSlug, setPackageSlug] = useState<string>()
  const [editing, setEditing] = useState<{ draft: Draft; model: { configured: boolean; model: string | null } }>()
  const [history, setHistory] = useState<{ version: number; createdAt: string; migration: Partial<MigrationReport> }[]>()
  const [tab, setTab] = useState('policies')
  const [limitDollars, setLimitDollars] = useState('')
  const [requireVerified, setRequireVerified] = useState(true)
  const activeSlug = packageSlug ?? snapshot?.capabilities[0]?.slug
  const procurementCap = snapshot ? capabilityOf(snapshot, 'procurement') : undefined

  useEffect(() => {
    if (!procurementCap) return
    setLimitDollars(String(Number(procurementCap.definition.settings.approvalLimitCents) / 100))
    setRequireVerified(Boolean(procurementCap.definition.settings.requireVerifiedSupplier))
  }, [procurementCap?.slug, procurementCap?.version])

  if (session.isPending) return <LoadingShell />
  if (!session.data) return <Navigate to="/login" search={{ mode: 'login' }} />
  if (!snapshot) {
    return error
      ? <main className="auth-page"><Alert variant="danger">{error}</Alert><p><Link to="/">Back to projects</Link></p></main>
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
        <main className="main" id="main-content" tabIndex={-1}>
          <header className="main-header">
            <div>
              <h1>Configure {snapshot.project?.name}</h1>
              <p>{snapshot.project?.editable ? `Application version ${snapshot.project.version}. Draft and preview changes before publishing.` : 'Packages, policies, and execution history.'}</p>
            </div>
            {snapshot.project?.editable && !editing ? <Button disabled={busy} onPress={() => run('Application draft opened.', async () => setEditing(await request('/api/kernel', { type: 'edit_project', project: projectSlug })))}>Change application</Button> : null}
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            {editing ? <ApplicationStudio key={editing.draft.id} draft={editing.draft} model={editing.model} onSaved={draft => setEditing(current => current ? { ...current, draft } : current)} onClose={() => setEditing(undefined)} /> : <>
            <div className="stack">
              {packageOptions.length > 1 && (tab === 'packages' || (tab === 'policies' && !snapshot.project?.editable)) ? (
                <ToggleGroup label="Entity" value={activeSlug ?? packageOptions[0].value} onChange={setPackageSlug} options={packageOptions} />
              ) : null}
              <Tabs
                label="Configure"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'policies', label: snapshot.project?.editable ? 'Application' : 'Policies', panel: activeSlug === 'procurement' && procurementCap ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>Approval policy</CardTitle>
                        <CardDescription>Publishing creates a new definition version. Existing proposals cannot silently adopt it.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field>
                            <FieldLabel>Approval limit (USD)</FieldLabel>
                            <Input type="number" min={0.01} step={0.01} value={limitDollars} onChange={event => setLimitDollars(event.target.value)} />
                          </Field>
                          <Switch label="Require verified supplier" description="When enabled, approve is blocked unless the supplier is marked verified." checked={requireVerified} onChange={setRequireVerified} />
                        </FieldGroup>
                      </CardContent>
                      <CardFooter>
                        <Button disabled={busy} onPress={() => run('Published a new capability version.', async () => {
                          const cents = Math.round(Number(limitDollars) * 100)
                          await request('/api/kernel', { type: 'policies', expectedVersion: procurementCap.version, approvalLimitCents: cents, requireVerifiedSupplier: requireVerified })
                          await refresh()
                        })}>{busy ? <Spinner data-icon="inline-start" /> : null}Publish version {procurementCap.version + 1}</Button>
                      </CardFooter>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>{snapshot.project?.editable ? 'Application overview' : 'No policy settings'}</CardTitle>
                        <CardDescription>
                          {snapshot.project?.editable ? 'Use Change application to edit fields and policies. Preview the effect on existing records before publishing a new version.' : packageBySlug(activeSlug ?? definition.slug)?.view === 'none'
                            ? 'This package has no configurable settings. Lifecycle changes are staged actions; a human apply commits them.'
                            : `Visibility is the publish action on each page or note. View: ${packageBySlug(activeSlug ?? definition.slug)?.view ?? 'none'}.`}
                        </CardDescription>
                      </CardHeader>
                      {snapshot.project?.editable ? <CardContent><dl className="kv"><dt>Published version</dt><dd>{snapshot.project.version}</dd><dt>Entities</dt><dd>{snapshot.capabilities.map(cap => cap.definition.entity.label).join(', ')}</dd><dt>Agent actions</dt><dd>Proposals require human review. Connect an external agent in Agents.</dd></dl><h3>Current policies</h3>{snapshot.capabilities.filter(cap => cap.definition.actions.some(action => action.policies.length)).map(cap => <div key={cap.slug}><strong>{cap.definition.name}</strong><ul>{cap.definition.actions.flatMap(action => action.policies.map(rule => <li key={`${action.name}-${rule.id}`}>{action.label}: {rule.label}{rule.setting && typeof cap.definition.settings[rule.setting] === 'number' ? ` · ${rule.field.endsWith('Cents') ? money(cap.definition.settings[rule.setting]) : cap.definition.settings[rule.setting]}` : ''}</li>))}</ul></div>)}</CardContent> : null}
                    </Card>
                  ) },
                  { id: 'packages', label: 'Entities', panel: (
                    <div className="stack">
                      <Card>
                        <CardHeader>
                          <CardTitle>{definition.entity.label}</CardTitle>
                          <CardDescription>{definition.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <dl className="kv">
                            {Object.entries(definition.entity.fields).map(([key, field]) => (
                              <Fragment key={key}>
                                <dt>{field.label}</dt>
                                <dd>{field.type}{field.editable ? '' : ' · kernel-owned'}{field.required ? '' : ' · optional'}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        </CardContent>
                      </Card>
                      {definition.actions.map(action => (
                        <Card key={action.name}>
                          <CardHeader>
                            <CardTitle>{action.label}</CardTitle>
                            <CardDescription>{action.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p className="muted">Roles: {action.roles.join(', ')}</p>
                            <p>Preconditions: {action.preconditions.map(rule => rule.label).join(', ') || 'None'}</p>
                            <p>Policies: {action.policies.map(rule => rule.label).join(', ') || 'None'}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) },
                  ...(snapshot.project?.editable ? [{ id: 'versions', label: 'Versions', panel: <Card><CardHeader><CardTitle>Published application versions</CardTitle><CardDescription>Definitions and migration summaries are retained for review. Restoring an older version is not supported yet.</CardDescription></CardHeader><CardContent><Button variant="outline" disabled={busy} onPress={() => run('Version history loaded.', async () => setHistory(await request(`/api/kernel?history=${encodeURIComponent(projectSlug)}`)))}>Load version history</Button>{history?.map(item => <div className="migration-change" key={item.version}><strong>Version {item.version}</strong><p className="muted">{date(item.createdAt)}</p><p>{item.version === 1 ? 'Initial publication' : `${item.migration.updatedRecordCount ?? 0} records updated · ${item.migration.changes?.length ?? 0} definition changes`}</p>{item.migration.changes?.length ? <details><summary>Definition changes</summary>{item.migration.changes.map((change, i) => <div key={i}><strong>{change.entity} · {change.label}</strong><p>Before: {change.before}</p><p>After: {change.after}</p></div>)}</details> : null}</div>)}</CardContent></Card> }] : []),
                  { id: 'agents', label: 'Agents', panel: <AgentAccessPanel key={projectSlug} project={projectSlug} capabilities={snapshot.capabilities} /> },
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
            <details className="simulator-inline"><summary>Test with the action simulator</summary>
              <Badge variant="warning">Simulator · not a live model</Badge>
              <p>This agent picks a defined action and stages it. It does not call a language model.</p>
              <Button variant="secondary" disabled={busy} onPress={() => run('Simulator staged a proposal.', async () => {
                const choice = chooseSimulation(snapshot)
                if (!choice) throw new Error('No eligible action is available.')
                const key = idempotencyKey(keys.current, `sim:${choice.action}:${choice.record.id}`)
                const result = await request<ActionResult>('/api/agent', { type: 'stage', recordId: choice.record.id, action: choice.action, input: choice.input, idempotencyKey: key })
                if (result.status === 'blocked') throw new Error(result.checks?.find(check => !check.passed)?.message || 'The simulator was blocked by policy.')
                keys.current.delete(`sim:${choice.action}:${choice.record.id}`)
                await refresh()
              })}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Stage next action
              </Button>
            </details>
            </div>
            </>}
          </div>
        </main>
      </ProjectFrame>
    </>
  )
}
