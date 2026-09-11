import { z } from 'zod'
import { auth } from './auth.server'
import { db } from './db.server'
import { Kernel, KernelError } from '../kernel/engine.server'
import type { Principal } from '../kernel/definition'

const kernel = new Kernel(db)
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('stage'), recordId: z.string().min(1), action: z.string().min(1), input: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().min(8).max(100) }).strict(),
  z.object({ type: z.literal('review'), changeId: z.string().min(1), decision: z.enum(['apply', 'reject']) }).strict(),
  z.object({ type: z.literal('policies'), expectedVersion: z.number().int().positive(), approvalLimitCents: z.number().int().min(1).max(100000000), requireVerifiedSupplier: z.boolean() }).strict(),
])

async function principal(request: Request, kind: Principal['kind']) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new KernelError('UNAUTHENTICATED', 'Sign in to your workspace.', 401)
  const member = await kernel.ensureWorkspace(session.user)
  return { userId: session.user.id, name: session.user.name, workspaceId: member.workspaceId, role: member.role, kind } satisfies Principal
}

function checkOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const allowed = new Set([process.env.BETTER_AUTH_URL || 'http://localhost:3000', 'http://localhost:3000', 'http://127.0.0.1:3000'])
  if (!origin || !allowed.has(origin)) throw new KernelError('INVALID_ORIGIN', 'This write must originate from your local workspace.', 403)
}

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleKernel(request: Request, agent = false) {
  try {
    if (request.method === 'POST') checkOrigin(request)
    const p = await principal(request, agent ? 'agent' : 'human')
    if (request.method === 'GET') {
      const state = await kernel.snapshot(p)
      return response(agent ? { tools: state.tools, records: state.records, capabilityVersion: state.capability.version, mode: 'Authenticated tools; proposals require human review.' } : state)
    }
    const text = await request.text()
    if (text.length > 32000) throw new KernelError('TOO_LARGE', 'Request exceeds the size limit.', 413)
    const command = commandSchema.parse(JSON.parse(text))
    if (agent && command.type !== 'stage') throw new KernelError('FORBIDDEN', 'The agent endpoint can only stage proposals.', 403)
    switch (command.type) {
      case 'create': return response(await kernel.createRecord(p, command.data))
      case 'stage': return response(await kernel.stage(p, command))
      case 'review': return response(await kernel.review(p, command.changeId, command.decision))
      case 'policies': return response(await kernel.updatePolicies(p, command.expectedVersion, { approvalLimitCents: command.approvalLimitCents, requireVerifiedSupplier: command.requireVerifiedSupplier }))
    }
  } catch (error) {
    if (error instanceof KernelError) return response({ error: error.message, code: error.code }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: 'Invalid input. Check the required fields.', code: 'INVALID_INPUT' }, 400)
    if (error instanceof Error && !('code' in error)) return response({ error: error.message, code: 'INVALID_INPUT' }, 400)
    console.error('Kernel request failed', error instanceof Error ? error.name : 'Unknown error')
    return response({ error: 'The operation could not complete. Refresh and try again.', code: 'INTERNAL_ERROR' }, 500)
  }
}
