import { createFileRoute } from '@tanstack/react-router'
import { handlePublic } from '@/lib/api.server'

export const Route = createFileRoute('/api/public/$workspaceId')({
  server: { handlers: {
    GET: ({ params }) => handlePublic(params.workspaceId),
  } },
})
