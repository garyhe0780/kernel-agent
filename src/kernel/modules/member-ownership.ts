import { kernelModuleSchema, type ModuleSource } from '../module-contract'
import { relationshipConsistencyModules } from './relationship-consistency'

const withoutDirectoryOwner = (source: ModuleSource) => {
  const next = kernelModuleSchema.parse(structuredClone(source))
  next.version = 4
  next.ports = next.ports.filter(port => port.target !== 'directory.person').map(port => port.target === 'sales.deal' ? { ...port, targetVersion: 4 } : port)
  next.views = next.views.map(view => ({ ...view, columns: view.columns.filter(key => key !== 'owner') }))
  if (next.layout) next.layout.sections = next.layout.sections.map(section => ({ ...section, fields: section.fields.filter(key => key !== 'owner') }))
  return next
}
const [dealV3, taskV3, activityV3] = relationshipConsistencyModules
const dealV4 = withoutDirectoryOwner(dealV3)
dealV4.definition.entity.fields.status.closed = ['won', 'lost']
export const memberOwnershipModules = [dealV4, withoutDirectoryOwner(taskV3), withoutDirectoryOwner(activityV3)]
