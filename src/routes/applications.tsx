import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceHome } from '@/components/workspace-home'
export const Route = createFileRoute('/applications')({ component: () => <WorkspaceHome view="applications" /> })
