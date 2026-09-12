import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceApp } from '@/components/workspace-app'

export const Route = createFileRoute('/p/$projectSlug/')({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectSlug } = Route.useParams()
  return <WorkspaceApp projectSlug={projectSlug} />
}
