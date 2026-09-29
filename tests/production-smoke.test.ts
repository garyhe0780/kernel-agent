import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productionOrigin, productionSmoke } from '../scripts/acceptance/production-smoke'

function transport(overrides: Record<string, () => Response> = {}) {
  return (async (url, init) => {
    assert.equal(init?.redirect, 'manual')
    const u = new URL(String(url))
    if (overrides[u.pathname]) return overrides[u.pathname]()
    if (u.searchParams.has('workspace')) return new Response(null, { status: 307, headers: { Location: '/workspace?workspace=smoke-synthetic' } })
    if (u.pathname === '/login' && !u.searchParams.has('mode')) return new Response(null, { status: 307, headers: { Location: '/login?mode=login' } })
    if (u.pathname.startsWith('/assets/')) return new Response(null, { headers: { 'Content-Type': 'text/javascript' } })
    if (u.pathname === '/api/auth/get-session') return Response.json(null)
    const h = new Headers(init?.headers)
    if (u.pathname === '/api/kernel' && h.has('cookie')) return Response.json(u.searchParams.has('operationHealth') ? { status: 'healthy', stalled: 0 } : { principal: { role: 'owner' }, workspace: { id: 'pilot' } })
    if (u.pathname === '/api/agent' && h.has('authorization')) return Response.json({ capabilities: [], records: [] })
    if (u.pathname === '/api/mcp' && h.has('authorization')) return Response.json({ result: { tools: [{ name: 'manage_run' }] } })
    if (u.pathname.startsWith('/api/')) return Response.json({ error: 'unauthorized' }, { status: 401 })
    if (u.pathname.includes('missing-guide')) return new Response('Missing', { status: 404 })
    return new Response('<title>Sign in</title><main>Kernel runtime Meet Kernel Run Kernel locally Connect an agent Operate and review runs</main><script src="/assets/app.js"></script>', { headers: { 'Content-Type': 'text/html' } })
  }) as typeof fetch
}
test('smoke origin refuses credential URLs and nonlocal plaintext', () => {
  assert.equal(productionOrigin('https://kernel.example/'), 'https://kernel.example')
  assert.equal(productionOrigin('http://localhost:3025'), 'http://localhost:3025')
  for (const url of ['http://kernel.example', 'https://user:secret@kernel.example', 'https://kernel.example/?token=secret', 'https://kernel.example/docs', 'https://kernel.example/#secret']) assert.throws(() => productionOrigin(url))
})
test('public smoke passes HTTP checks but never claims workflow acceptance', async () => {
  const report = await productionSmoke({ origin: 'https://kernel.example', fetcher: transport() })
  assert.equal(report.automatedStatus, 'passed')
  assert.equal(report.acceptanceStatus, 'incomplete')
  assert.ok(report.checks.some(c => c.id === 'journey:crm' && c.status === 'skipped'))
})
test('dedicated credentials are confined to intended endpoints and excluded from reports', async () => {
  const base = transport()
  const seen: string[] = []
  const fetcher: typeof fetch = async (url, init) => {
    const h = new Headers(init?.headers), path = new URL(String(url)).pathname
    if (h.has('authorization')) { assert.ok(['/api/agent', '/api/mcp'].includes(path)); seen.push('agent') }
    if (h.has('cookie')) { assert.equal(path, '/api/kernel'); seen.push('owner') }
    return base(url, init)
  }
  const report = await productionSmoke({ origin: 'https://kernel.example', agentToken: 'secret-token', sessionCookie: 'session=private-value', workspaceId: 'pilot', fetcher })
  assert.equal(report.automatedStatus, 'passed')
  assert.deepEqual(seen.sort(), ['agent', 'agent', 'owner', 'owner'])
  assert.equal(JSON.stringify(report).includes('secret-token'), false)
  assert.equal(JSON.stringify(report).includes('private-value'), false)
})
test('broken assets, server errors, and stale workers fail without echoing response data', async () => {
  const report = await productionSmoke({ origin: 'https://kernel.example', sessionCookie: 'secret', workspaceId: 'pilot', fetcher: transport({
    '/assets/app.js': () => new Response('private asset diagnostics', { status: 404 }),
    '/api/kernel': () => Response.json({ secret: 'private server payload', status: 'unavailable', stalled: 1 }),
  }) })
  assert.equal(report.automatedStatus, 'failed')
  assert.equal(report.acceptanceStatus, 'failed')
  assert.equal(report.checks.find(c => c.id === 'owner:worker-health')?.status, 'failed')
  assert.equal(JSON.stringify(report).includes('private'), false)
})
test('credential redirects are not followed and missing access cannot pass', async () => {
  const report = await productionSmoke({ origin: 'https://kernel.example', agentToken: 'secret', fetcher: transport({ '/api/agent': () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example' } }) }) })
  assert.equal(report.checks.find(c => c.id === 'agent:discovery')?.status, 'failed')
})
