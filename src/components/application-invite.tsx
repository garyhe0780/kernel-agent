import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { request } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/surfaces'

export function ApplicationInvite({ projectSlug, projectName }: { projectSlug: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Button variant="ghost" className="nav-item" onPress={() => { setOpen(true); setError(''); setLink('') }}>
        <UserPlus data-icon="inline-start" /><span>Invite user</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Invite someone to ${projectName}`} description="They create a password or sign in with this email, then land in this application. They do not see the rest of the workspace. The link expires in seven days. No email is sent.">
        <form className="stack" onSubmit={async event => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const result = await request<{ token: string }>('/api/kernel', { type: 'invite_application_user', project: projectSlug, email: email.trim() })
            setLink(`${window.location.origin}/login?mode=signup&app=${encodeURIComponent(result.token)}`)
            setEmail('')
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to create an invitation.')
          } finally {
            setBusy(false)
          }
        }}>
          <label>Email address<input className="input" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="colleague@company.com" disabled={busy} /></label>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <div className="dialog-actions">
            <Button type="submit" isDisabled={busy || !email.trim()}>{busy ? 'Creating link…' : 'Create invite link'}</Button>
          </div>
          {link ? <label>Invitation link<input className="input" readOnly value={link} onFocus={event => event.target.select()} /></label> : null}
        </form>
      </Dialog>
    </>
  )
}
