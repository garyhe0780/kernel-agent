import { createFileRoute } from '@tanstack/react-router'
import { ProjectBuild } from '@/components/project-build'

export const Route = createFileRoute('/p/$projectSlug/build')({
  component: BuildPage,
})

function BuildPage() {
  const { projectSlug } = Route.useParams()
  return <ProjectBuild projectSlug={projectSlug} />
}
