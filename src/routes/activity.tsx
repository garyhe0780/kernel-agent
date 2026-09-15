import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceActivity } from '@/components/workspace-activity'
export const Route = createFileRoute('/activity')({ component: WorkspaceActivity })
