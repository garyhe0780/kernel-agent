import { createFileRoute } from '@tanstack/react-router'
import { PublicSite } from '@/components/public-site'

export const Route = createFileRoute('/s/$workspaceId')({
  component: PublicSitePage,
})

function PublicSitePage() {
  const { workspaceId } = Route.useParams()
  return <PublicSite workspaceId={workspaceId} />
}
