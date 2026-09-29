import { assigneeField, dealWorkViews, taskWorkViews } from './modules/follow-through'
import { InputError } from './errors'
import { assemblePattern, compileAssembly, validateApplication, type Application } from './application'

/** Compatibility belongs to the sales package, never to the generic migration engine. */
export function upgradeLegacyCrm(current: Application): Application {
  const next = compileAssembly(assemblePattern('crm_sales'))
  const legacy = current.entities.find(entity => entity.slug === 'opportunities')
  const deal = next.entities.find(entity => entity.slug === 'opportunities')!
  const mappings: Record<string, string> = { draft: 'new', open: 'qualified', converted: 'won' }
  for (const stage of legacy?.entity.fields.status.options ?? []) {
    if (deal.entity.fields.status.options!.includes(stage)) continue
    const target = mappings[stage]
    if (!target) throw new InputError(`Unsupported legacy sales stage: ${stage}. Author an explicit compatibility rule.`)
    deal.entity.fields.status.options!.push(stage)
    deal.actions.push({ name: `migrate_${stage}`, label: `Move legacy ${stage} to ${target}`, description: 'Move this existing deal into the new sales pipeline. Its history and relationships are retained.', humanExecution: 'direct', roles: ['owner', 'operator'], input: {}, preconditions: [{ id: 'state', label: `Legacy stage is ${stage}`, field: 'status', operator: 'eq', value: stage }], policies: [], effects: { status: target } })
  }
  next.assumptions.push('Existing draft, open and converted stages are preserved. Use the explicit legacy-stage action to move a deal into the new pipeline.')
  return validateApplication(next)
}


/** Add work queues without replacing a workspace's existing sales rules or legacy stages. */
export function upgradeCrmFollowThrough(current: Application, timeZone = 'UTC'): Application {
  const next = structuredClone(current)
  const targets = [{ slug: 'opportunities', views: dealWorkViews(next.entities.find(entity => entity.slug === 'opportunities')!.entity.fields.status.options!) }, { slug: 'tasks', views: taskWorkViews() }]
  for (const { slug, views } of targets) {
    const entity = next.entities.find(entity => entity.slug === slug)
    if (!entity) throw new InputError(`Missing CRM entity: ${slug}`)
    if (entity.entity.fields.assignee && JSON.stringify(entity.entity.fields.assignee) !== JSON.stringify(assigneeField)) throw new InputError('Existing assignee field differs; review the definition before upgrading.')
    entity.entity.fields.assignee = { ...assigneeField }
    const edit = entity.actions.find(action => action.name === 'edit')
    if (!edit) throw new InputError(`Missing edit action on ${slug}`)
    edit.input.assignee = { ...assigneeField, required: true }
    edit.effects.assignee = '$input.assignee'
    for (const view of views) {
      if (next.views.some(existing => existing.id === view.id)) continue
      next.views.push({ ...view, entity: slug, timeZone })
    }
    const layout = next.layouts.find(layout => layout.entity === slug)
    if (layout && !layout.sections.some(section => section.fields.includes('assignee'))) layout.sections[0].fields.push('assignee')
  }
  next.startView = 'deals_today'
  return validateApplication(next)
}

const legacyStages = ['draft', 'open', 'converted']

/** Retire compatibility stages once no record uses them. */
export function retireLegacyCrmStages(current: Application): Application {
  const next = structuredClone(current)
  const deal = next.entities.find(entity => entity.slug === 'opportunities')
  if (!deal?.entity.fields.status.options) throw new InputError('Expected deal stages are missing.')
  const retired = deal.entity.fields.status.options.filter(stage => legacyStages.includes(stage))
  deal.entity.fields.status.options = deal.entity.fields.status.options.filter(stage => !retired.includes(stage))
  deal.actions = deal.actions.filter(action => !retired.some(stage => action.name === `migrate_${stage}`))
  for (const view of next.views.filter(view => view.entity === 'opportunities')) {
    if (view.filters.some(filter => filter.field === 'status' && filter.operator !== 'neq' && retired.includes(String(filter.value)))) throw new InputError(`View ${view.name} depends on a retired stage. Review it before upgrading.`)
    view.filters = view.filters.filter(filter => !(filter.field === 'status' && retired.includes(String(filter.value))))
  }
  next.assumptions = next.assumptions.filter(text => !text.startsWith('Existing draft, open and converted stages are preserved.'))
  return validateApplication(next)
}

/** Match sales package release 4: members own deals and tasks, the Team directory and its stored owners are deleted, and won/lost are closed. */
export function upgradeCrmMemberOwnership(current: Application): Application {
  const next = structuredClone(current)
  const deal = next.entities.find(entity => entity.slug === 'opportunities')
  if (!deal?.entity.fields.assignee || !deal.entity.fields.status.options) throw new InputError('Add member assignments before removing the Team directory.')
  const team = 'people'
  next.entities = next.entities.filter(entity => entity.slug !== team)
  for (const entity of next.entities) {
    const removed = Object.keys(entity.entity.fields).filter(key => entity.entity.fields[key].reference === team)
    if (!removed.length) continue
    if (!entity.entity.fields.assignee) throw new InputError(`${entity.name} links to the Team directory without a member assignment to replace it.`)
    for (const key of removed) delete entity.entity.fields[key]
    for (const action of entity.actions) {
      for (const [key, field] of Object.entries(action.input)) if (field.reference === team) delete action.input[key]
      for (const key of removed) delete action.effects[key]
    }
    for (const view of next.views.filter(view => view.entity === entity.slug)) {
      view.columns = view.columns.includes('assignee') ? view.columns.filter(key => !removed.includes(key)) : view.columns.map(key => removed.includes(key) ? 'assignee' : key)
      view.filters = view.filters.filter(filter => !removed.includes(filter.field))
      if (removed.includes(view.sort.field)) view.sort = { field: '$createdAt', direction: 'desc' }
    }
    for (const section of next.layouts.find(layout => layout.entity === entity.slug)?.sections ?? []) section.fields = section.fields.filter(key => !removed.includes(key))
  }
  next.views = next.views.filter(view => view.entity !== team)
  next.layouts = next.layouts.filter(layout => layout.entity !== team)
  next.navigation = next.navigation.filter(item => item.entity !== team)
  if (next.startView && !next.views.some(view => view.id === next.startView)) next.startView = null
  const closed = ['won', 'lost'].filter(stage => deal.entity.fields.status.options!.includes(stage))
  if (closed.length) deal.entity.fields.status.closed = closed
  next.assumptions = next.assumptions.map(text => text === 'Team directory owners are business assignments, not login permissions.' ? 'Deals and tasks are assigned to workspace members; assignment does not grant access.' : text)
  return validateApplication(next)
}

/** Replace an installed CRM definition with the current sales package, keeping its name and work-queue time zone. Migration preview reports anything removed. */
export function adoptSalesPackage(current: Application): Application {
  const next = compileAssembly(assemblePattern('crm_sales'))
  const timeZone = current.views.find(view => view.timeZone && view.timeZone !== 'UTC')?.timeZone
  if (timeZone) for (const view of next.views) if (view.filters.some(filter => filter.operator === 'date_on' || filter.operator === 'date_before')) view.timeZone = timeZone
  return validateApplication({ ...next, name: current.name, description: current.description })
}

/** Apply the sales relationship rule without replacing local configuration. */
export function upgradeCrmRelationships(current: Application): Application {
  const next = structuredClone(current)
  const deal = next.entities.find(entity => entity.slug === 'opportunities')
  if (!deal?.entity.fields.contactPerson || !deal.entity.fields.customer) throw new InputError('Expected deal relationships are missing.')
  const rule = { sourceField: 'customer', targetField: 'account' }
  deal.entity.fields.contactPerson.referenceMatch = rule
  return validateApplication(next)
}
