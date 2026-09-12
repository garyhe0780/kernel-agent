import { AuditApp } from '@/components/audit-app'
import { ProcurementApp } from '@/components/procurement-app'
import { SiteApp } from '@/components/site-app'
import { WorkbenchApp } from '@/components/workbench-app'
import { projectTemplate } from '@/kernel/projects'

export function WorkspaceApp({ projectSlug }: { projectSlug: string }) {
  if (projectTemplate(projectSlug)?.shell === 'site') return <SiteApp projectSlug={projectSlug} />
  if (projectSlug === 'procurement') return <ProcurementApp projectSlug={projectSlug} />
  if (projectSlug === 'audit') return <AuditApp projectSlug={projectSlug} />
  return <WorkbenchApp projectSlug={projectSlug} />
}
