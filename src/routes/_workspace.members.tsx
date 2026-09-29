import { createFileRoute } from '@tanstack/react-router'
import { AccountMembers } from '@/components/account-members'
import { useWorkspaceSnapshot } from '@/components/workspace-layout'
import { Alert } from '@/components/ui/surfaces'
export const Route = createFileRoute('/_workspace/members')({ component: MembersPage })
function MembersPage() {
  const snapshot = useWorkspaceSnapshot()
  return <main className="main members-page" id="main-content" tabIndex={-1}>{snapshot.principal.role === 'owner' ? <AccountMembers accountName={snapshot.workspace.name} userId={snapshot.principal.userId} /> : <Alert>Only workspace owners can manage workspace members.</Alert>}</main>
}
