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
import { date, request, shortId, type ActionResult } from '@/lib/client'
import { capabilityOf, chooseSimulation, idempotencyKey, statusVariant } from '@/lib/project-ui'
import { useProject } from '@/lib/use-project'

export function ProjectBuild({ projectSlug }: { projectSlug: string }) {
  const { session, snapshot, error, busy, run, refresh, keys } = useProject(projectSlug)
  const [packageSlug, setPackageSlug] = useState<string>()
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
        <div className="main">
          <header className="main-header">
            <div>
              <h1>Configure {snapshot.project?.name}</h1>
              <p>Packages, policies, and the simulator live here. They are not part of the product queue.</p>
            </div>
          </header>
          <div className="main-body">
            {error ? <Alert variant="danger">{error}</Alert> : null}
            <div className="simulator-inline">
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
            </div>
            <div className="stack">
              {packageOptions.length > 1 ? (
                <ToggleGroup label="Package" value={activeSlug ?? packageOptions[0].value} onChange={setPackageSlug} options={packageOptions} />
              ) : null}
              <Tabs
                label="Configure"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'policies', label: 'Policies', panel: activeSlug === 'procurement' && procurementCap ? (
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
                        <CardTitle>No policy settings</CardTitle>
                        <CardDescription>
                          {packageBySlug(activeSlug ?? definition.slug)?.view === 'none'
                            ? 'This package has no configurable settings. Lifecycle changes are staged actions; a human apply commits them.'
                            : `Visibility is the publish action on each page or note. View: ${packageBySlug(activeSlug ?? definition.slug)?.view ?? 'none'}.`}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) },
                  { id: 'packages', label: 'Packages', panel: (
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
                                  <div className="muted">{event.actorName} · {event.actorKind === 'agent' ? 'simulator' : event.actorKind}{event.recordId ? ` · ${shortId(event.recordId)}` : ''}</div>
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
          </div>
        </div>
      </ProjectFrame>
    </>
  )
}
