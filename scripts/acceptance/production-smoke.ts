export type Check = { id: string; status: 'passed' | 'failed' | 'skipped'; detail: string }
export type SmokeOptions = { origin: string; agentToken?: string; sessionCookie?: string; workspaceId?: string; fetcher?: typeof fetch }
export function productionOrigin(value: string) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an origin without credentials, path, query, or fragment.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Production requires HTTPS; HTTP is allowed only for localhost.')
  return url.origin
}
/** Read-only requests. Reports never contain response bodies, cookies, or credentials. */
export async function productionSmoke(options: SmokeOptions) {
  const origin = productionOrigin(options.origin), fetcher = options.fetcher ?? fetch
  const checks: Check[] = []
  const request = (path: string, init: RequestInit = {}) => fetcher(`${origin}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  const check = async (id: string, task: () => Promise<string>) => {
    try { checks.push({ id, status: 'passed', detail: await task() }) }
    catch { checks.push({ id, status: 'failed', detail: 'Expected response was not received. Check deployment, access configuration, and server logs; no response content is included here.' }) }
  }
  const expect = (condition: unknown) => { if (!condition) throw new Error('Unexpected response') }
  for (const [path, marker] of [['/', 'Kernel runtime'], ['/docs', 'Meet Kernel'], ['/docs/quickstart', 'Run Kernel locally'], ['/docs/connect-agents', 'Connect an agent'], ['/docs/agent-runs', 'Operate and review runs'], ['/login?mode=login', 'Sign in']] as const) {
    await check(`public:${path}`, async () => {
      const response = await request(path), text = await response.text()
      expect(response.status === 200 && response.headers.get('content-type')?.includes('text/html') && text.includes(marker))
      const assets = [...text.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m => m[1])
      expect(assets.length > 0)
      for (const asset of new Set(assets)) {
        const result = await request(asset, { method: 'HEAD' })
        expect(result.status === 200 && /javascript|text\/css/.test(result.headers.get('content-type') ?? ''))
      }
      return 'Anonymous HTML and referenced local JS/CSS assets respond successfully.'
    })
  }
  await check('docs:missing-guide', async () => { const r = await request('/docs/acceptance-missing-guide'); expect(r.status === 404); return 'Unknown guide returns 404.' })
  await check('workspace:legacy-redirect', async () => { const r = await request('/?workspace=smoke-synthetic'); expect([302, 307, 308].includes(r.status)); const location = new URL(r.headers.get('location') ?? '', origin); expect(location.origin === origin && location.pathname === '/workspace' && location.searchParams.get('workspace') === 'smoke-synthetic'); return 'Legacy workspace link redirects within the deployment.' })
  await check('auth:anonymous-session', async () => { const r = await request('/api/auth/get-session'); expect(r.status === 200 && await r.json() === null); return 'Anonymous request has no authenticated session.' })
  for (const path of ['/api/kernel', '/api/agent']) await check(`access:${path}`, async () => { const r = await request(path); expect(r.status === 401); return 'Unauthenticated access is rejected.' })
  await check('access:mcp', async () => { const r = await request('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }); expect(r.status === 401); return 'MCP discovery requires a credential.' })
  if (options.agentToken) {
    const headers = { Authorization: `Bearer ${options.agentToken}` }
    await check('agent:discovery', async () => { const r = await request('/api/agent', { headers }); const body = await r.json(); expect(r.status === 200 && Array.isArray(body.capabilities) && Array.isArray(body.records)); return 'Operating credential discovers application contracts.' })
    await check('agent:mcp-tools', async () => { const r = await request('/api/mcp', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) }); const body = await r.json(); expect(r.status === 200 && Array.isArray(body.result?.tools) && body.result.tools.some((t: { name: string }) => t.name === 'manage_run')); return 'Operating MCP tools are discoverable.' })
  } else checks.push({ id: 'agent:discovery-and-mcp', status: 'skipped', detail: 'Set KERNEL_SMOKE_AGENT_TOKEN to a dedicated pilot operating credential.' })
  if (options.sessionCookie && options.workspaceId) {
    const headers = { Cookie: options.sessionCookie, 'x-kernel-workspace': options.workspaceId }
    await check('owner:workspace', async () => { const r = await request('/api/kernel', { headers }); const body = await r.json(); expect(r.status === 200 && body.principal?.role === 'owner' && body.workspace?.id === options.workspaceId); return 'Owner session reaches the selected pilot workspace.' })
    await check('owner:worker-health', async () => { const r = await request('/api/kernel?operationHealth=1', { headers }); const body = await r.json(); expect(r.status === 200 && body.status === 'healthy' && body.stalled === 0); return 'Worker reports a recent successful poll and no stalled runs in the pilot workspace.' })
  } else checks.push({ id: 'owner:workspace-and-worker', status: 'skipped', detail: 'Provide a local session-cookie file and dedicated pilot workspace ID to verify authenticated access and worker health.' })
  for (const id of ['database:migration-status', 'journey:crm', 'journey:project-issues', 'journey:review-cancel-recovery', 'browser:desktop-mobile', 'pilot:operator-observation']) checks.push({ id, status: 'skipped', detail: 'Requires recorded evidence in the production acceptance checklist; automated HTTP checks do not establish this result.' })
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), origin, mode: 'read-only' as const,
    automatedStatus: checks.some(c => c.status === 'failed') ? 'failed' : 'passed',
    acceptanceStatus: checks.some(c => c.status === 'failed') ? 'failed' : 'incomplete', checks }
}
