import { z } from 'zod'
import type { AgentAccess } from '../kernel/agent-access.server'
import { Kernel, KernelError } from '../kernel/engine.server'

const stage = z.object({ type: z.literal('stage'), recordId: z.string().min(1), action: z.string().min(1), input: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().min(8).max(100) }).strict()
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) } })

export async function handleAgentCredential(request: Request, access: AgentAccess, kernel: Kernel) {
  try {
    const header = request.headers.get('authorization') ?? ''
    const match = /^Bearer (\S+)$/i.exec(header)
    if (!match) throw new KernelError('INVALID_CREDENTIAL', 'Send an agent credential in the Authorization: Bearer header.', 401)
    const p = await access.authenticate(match[1])
    if (p.agentGrant === 'construct') throw new KernelError('FORBIDDEN', 'Builder credentials use /api/mcp to save and publish application drafts.', 403)
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      for (const key of params.keys()) if (!['cursor', 'change'].includes(key)) throw new KernelError('INVALID_INPUT', 'Use cursor to page records or change to read your proposal. The credential selects the application.')
      if (params.has('change')) return reply(await kernel.agentProposal(p, params.get('change')!))
      const cursor = z.string().max(200).optional().parse(params.get('cursor') ?? undefined)
      return reply(await kernel.agentSnapshot(p, cursor))
    }
    if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED', error: 'Use GET or POST.' }, 405)
    const body = await request.text()
    if (body.length > 128000) throw new KernelError('TOO_LARGE', 'Request exceeds the size limit.', 413)
    const raw = JSON.parse(body)
    if (raw?.type !== 'stage') throw new KernelError('FORBIDDEN', 'Agent credentials can only stage proposals.', 403)
    return reply(await kernel.stage(p, stage.parse(raw)))
  } catch (error) {
    if (error instanceof KernelError) return reply({ error: error.message, code: error.code }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: 'Invalid request. Check the action contract and required fields.', code: 'INVALID_INPUT' }, 400)
    return reply({ error: 'The operation could not complete.', code: 'INTERNAL_ERROR' }, 500)
  }
}
