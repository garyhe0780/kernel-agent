import { createFileRoute } from '@tanstack/react-router'
import { handleKernel } from '@/lib/api.server'

export const Route = createFileRoute('/api/kernel')({
  server: { handlers: {
    GET: ({ request }) => handleKernel(request),
    POST: ({ request }) => handleKernel(request),
  } },
})
