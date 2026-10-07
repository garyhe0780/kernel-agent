import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { KernelError } from '../kernel/errors'
import { readBoundedText } from './request-body.server'
import { serverErrorDetails } from './server-error'

const signup = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict()
type WaitlistDatabase = Pick<PrismaClient, 'waitlistEntry'>

async function database(): Promise<WaitlistDatabase> {
  const { getRuntime } = await import('./runtime.server')
  return (await getRuntime()).db
}

export async function handleWaitlist(request: Request, getDatabase: () => Promise<WaitlistDatabase> = database) {
  const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
  if (request.method !== 'POST') return respond({ error: 'Use POST to join the waitlist.' }, 405, { Allow: 'POST' })
  if (request.headers.get('origin') !== new URL(request.url).origin) return respond({ error: 'Submit the form from the Kernel home page.' }, 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return respond({ error: 'Send an email address as JSON.' }, 415)
  try {
    const text = await readBoundedText(request, 2048)
    let body: unknown
    try { body = JSON.parse(text) } catch { return respond({ error: 'Enter a valid email address.' }, 400) }
    const parsed = signup.safeParse(body)
    if (!parsed.success) return respond({ error: 'Enter a valid email address.' }, 400)
    const db = await getDatabase()
    // A unique key and ON CONFLICT keep retries and simultaneous signups idempotent.
    await db.waitlistEntry.createMany({ data: [{ email: parsed.data.email }], skipDuplicates: true })
    return respond({ joined: true })
  } catch (error) {
    if (error instanceof KernelError) return respond({ error: error.message }, error.status)
    console.error('Waitlist signup failed:', serverErrorDetails(error))
    return respond({ error: 'We couldn’t save your email. Please try again.' }, 503)
  }
}
