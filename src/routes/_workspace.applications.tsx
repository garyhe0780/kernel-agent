import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceHome } from '@/components/workspace-home'

export const Route = createFileRoute('/_workspace/applications')({
  validateSearch: (search: Record<string, unknown>): { assemble?: string; pattern?: string } => ({
    assemble: typeof search.assemble === 'string' && search.assemble.trim() ? search.assemble.trim() : undefined,
    pattern: typeof search.pattern === 'string' && search.pattern.trim() ? search.pattern.trim() : undefined,
  }),
  component: ApplicationsPage,
})

function ApplicationsPage() {
  const { assemble, pattern } = Route.useSearch()
  return <WorkspaceHome view="applications" assemble={assemble} pattern={pattern} />
}
