import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { productionSmoke } from './acceptance/production-smoke'

const args = process.argv.slice(2)
const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
const allowed = new Set(['--origin', '--report', '--session-file', '--workspace'])
async function main() {
  for (let i = 0; i < args.length; i += 2) if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: pnpm accept:production --origin https://YOUR_HOST [--report PATH] [--session-file PATH --workspace ID]')
  const origin = value('--origin')
  if (!origin) throw new Error('Provide --origin https://YOUR_HOST. No deployment is inferred.')
  const sessionFile = value('--session-file'), workspaceId = value('--workspace')
  if (Boolean(sessionFile) !== Boolean(workspaceId)) throw new Error('--session-file and --workspace must be supplied together.')
  const sessionCookie = sessionFile ? (await readFile(sessionFile, 'utf8')).trim() : undefined
  if (sessionCookie && /[\r\n]/.test(sessionCookie)) throw new Error('Session file must contain a single Cookie header value.')
  const report = await productionSmoke({ origin, workspaceId, sessionCookie, agentToken: process.env.KERNEL_SMOKE_AGENT_TOKEN })
  const path = resolve(value('--report') ?? `validation/production/smoke-${Date.now()}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  for (const check of report.checks) console.log(`${check.status.toUpperCase()} ${check.id}: ${check.detail}`)
  console.log(`Automated checks: ${report.automatedStatus}. Production acceptance: ${report.acceptanceStatus}.\nReport: ${path}`)
  if (report.automatedStatus === 'failed') process.exitCode = 1
}
main().catch(() => { console.error('Smoke test could not start. Check --origin, paired --session-file/--workspace, and readable local files. No credentials or raw error details were logged.'); process.exitCode = 1 })
