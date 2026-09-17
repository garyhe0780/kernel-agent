import { createFileRoute } from '@tanstack/react-router'
import { handleMcp } from '@/lib/mcp.server'
import { getRuntime } from '@/lib/runtime.server'
import { authUrl } from '@/lib/env.server'

const handle = async ({ request }: { request: Request }) => {
  const { agentAccess, kernel } = await getRuntime()
  return handleMcp(request, agentAccess, kernel, authUrl())
}
export const Route = createFileRoute('/api/mcp')({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
