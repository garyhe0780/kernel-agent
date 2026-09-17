import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceCatalog } from '@/components/workspace-catalog'
export const Route = createFileRoute('/_workspace/catalog')({ component: WorkspaceCatalog })
