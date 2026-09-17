import { createFileRoute } from '@tanstack/react-router'
import { getRuntime } from '@/lib/runtime.server'

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: {
    GET: async ({ request }) => (await getRuntime()).auth.handler(request),
    POST: async ({ request }) => (await getRuntime()).auth.handler(request),
  } },
})
