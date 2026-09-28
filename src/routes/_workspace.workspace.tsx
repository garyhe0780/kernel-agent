import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceHome } from '@/components/workspace-home'
export const Route = createFileRoute('/_workspace/workspace')({ validateSearch: (search: Record<string, unknown>): { workspace?: string } => typeof search.workspace === 'string' ? { workspace: search.workspace } : {}, component: WorkspaceHome })
