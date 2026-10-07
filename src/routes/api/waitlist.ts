import { createFileRoute } from '@tanstack/react-router'
import { handleWaitlist } from '@/lib/waitlist.server'

export const Route = createFileRoute('/api/waitlist')({
  server: { handlers: { POST: ({ request }) => handleWaitlist(request) } },
})
