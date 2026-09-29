import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Spinner } from './ui/surfaces'

type Props = { token: string; mcpUrl: string; onDone: () => void }

export function BuilderConnectionSetup({ token, mcpUrl, onDone }: Props) {
  const [copied, setCopied] = useState('')
  const [testing, setTesting] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  async function copy(value: string, label: string) {
    setError('')
    try { await navigator.clipboard.writeText(value); setCopied(label) }
    catch { setError('Unable to copy. Select the value and copy it manually.') }
  }
  async function test() {
    setTesting(true); setError(''); setVerified(false)
    try {
      const response = await fetch(mcpUrl, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), signal: AbortSignal.timeout(15000) })
      const value = await response.json() as { result?: { tools?: { name: string }[] }; error?: { message?: string } }
      if (!response.ok || value.error) throw new Error(value.error?.message || 'MCP connection failed. Check the endpoint and try again.')
      if (!value.result?.tools?.some(tool => tool.name === 'save_draft')) throw new Error('This credential did not expose construction tools.')
      setVerified(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection failed. Try again.') }
    finally { setTesting(false) }
  }
  function copyButton(value: string, label: string) {
    return <Button variant="outline" size="sm" aria-label={`Copy ${label}`} onPress={() => void copy(value, label)}>{copied === label ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied === label ? 'Copied' : 'Copy'}</Button>
  }
  return <div className="builder-connection-setup">
    <section className="builder-secret" aria-labelledby="builder-secret-title">
      <div className="builder-setup-heading"><KeyRound aria-hidden="true" /><h3 id="builder-secret-title">Save your credential</h3><span>Shown once</span></div>
      <p>Store this in your agent’s secret configuration. You won’t be able to view it again.</p>
      <Field isReadOnly value={token} aria-label="Agent credential"><div className="builder-copy-row"><Input autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} />{copyButton(token, 'credential')}</div></Field>
    </section>
    <section className="builder-client-settings" aria-labelledby="builder-settings-title">
      <h3 id="builder-settings-title">Configure your MCP client</h3>
      <Field isReadOnly value={mcpUrl}><FieldLabel>Server URL</FieldLabel><div className="builder-copy-row"><Input onFocus={event => event.target.select()} />{copyButton(mcpUrl, 'server URL')}</div></Field>
      <dl className="builder-connection-facts"><div><dt>Transport</dt><dd>Streamable HTTP</dd></div><div><dt>Authorization</dt><dd><code>Bearer &lt;credential&gt;</code>{copyButton(`Bearer ${token}`, 'authorization value')}</dd></div></dl>
      <p className="builder-connection-help">Add an <code>Authorization</code> header with the value above. Your client must support custom headers; OAuth sign-in is not available.</p>
    </section>
    <details className="builder-connection-guide"><summary>What to do after connecting</summary><p>Call <code>list_patterns</code>, then prefer <code>save_draft</code> with a pattern ID. Review the draft before calling <code>publish_draft</code>. Publishing does not install sample records.</p></details>
    <div aria-live="polite" className="builder-connection-feedback">{error ? <Alert variant="danger">{error}</Alert> : verified ? <Alert><Check aria-hidden="true" /> Credential verified. The MCP endpoint exposes builder tools. Finish setup in your client to connect.</Alert> : copied ? <p>{copied === 'credential' ? 'Credential' : copied === 'server URL' ? 'Server URL' : 'Authorization value'} copied to clipboard.</p> : null}</div>
    <footer className="builder-connection-footer"><Button variant="outline" disabled={testing} onPress={() => void test()}>{testing ? <Spinner data-icon="inline-start" /> : null}{testing ? 'Testing connection…' : 'Test connection'}</Button><Button onPress={onDone}>I saved the credential</Button></footer>
  </div>
}
