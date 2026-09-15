import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceAgents } from '@/components/workspace-agents'
export const Route = createFileRoute('/agents')({ component: WorkspaceAgents })
