import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceInbox } from '@/components/workspace-inbox'
export const Route = createFileRoute('/inbox')({ component: WorkspaceInbox })
