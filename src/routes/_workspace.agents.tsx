import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceAgents } from '@/components/workspace-agents'
export const Route = createFileRoute('/_workspace/agents')({ component: WorkspaceAgents })
