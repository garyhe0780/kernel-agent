import { createFileRoute } from '@tanstack/react-router'
import { ApplicationMembers } from '@/components/application-members'
export const Route = createFileRoute('/p/$projectSlug/members')({ component: MembersPage })
function MembersPage() {
  const { projectSlug } = Route.useParams()
  return <ApplicationMembers projectSlug={projectSlug} />
}
