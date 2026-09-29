import { dealV2, salesTaskV2, salesActivityV2 } from './follow-through'

const dealV3 = structuredClone(dealV2)
dealV3.version = 3
dealV3.ports = dealV3.ports.map(port => port.field === 'contactPerson' ? { ...port, referenceMatch: { sourceField: 'customer', targetField: 'account' } } : port)
const dependents = [salesTaskV2, salesActivityV2].map(source => {
  const next = structuredClone(source)
  next.version = 3
  next.ports = next.ports.map(port => port.target === 'sales.deal' ? { ...port, targetVersion: 3 } : port)
  return next
})
export const relationshipConsistencyModules = [dealV3, ...dependents]
