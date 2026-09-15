import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceSettings } from '@/components/workspace-settings'
export const Route = createFileRoute('/settings')({ component: WorkspaceSettings })
