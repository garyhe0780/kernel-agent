import { createFileRoute } from '@tanstack/react-router'
import { handleMcp } from '@/lib/mcp.server'
import { db } from '@/lib/db.server'
import { AgentAccess } from '@/kernel/agent-access.server'
import { Kernel } from '@/kernel/engine.server'

const access = new AgentAccess(db)
const kernel = new Kernel(db)
const handle = ({ request }: { request: Request }) => handleMcp(request, access, kernel)
export const Route = createFileRoute('/api/mcp')({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
