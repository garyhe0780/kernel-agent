import { createFileRoute } from '@tanstack/react-router'
import { handleKernel } from '@/lib/api.server'

export const Route = createFileRoute('/api/agent')({
  server: { handlers: {
    GET: ({ request }) => handleKernel(request, true),
    POST: ({ request }) => handleKernel(request, true),
  } },
})
