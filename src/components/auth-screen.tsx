import { pendingInvitation } from '@/lib/pending-invitation'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Boxes, GitPullRequest, ShieldCheck, Workflow } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from './ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Badge, Spinner } from './ui/surfaces'

type AuthMode = 'login' | 'signup'

export function AuthScreen({ mode, invitationCode = '' }: { mode: AuthMode; invitationCode?: string }) {
  const navigate = useNavigate({ from: '/login' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signup = mode === 'signup'

  function setMode(next: AuthMode) {
    setError('')
    void navigate({ search: invitationCode ? { mode: next, code: invitationCode } : { mode: next } })
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">k</span>
          <span>kernel<span className="brand-period">.</span></span>
        </a>
        <div className="auth-story-content">
          <Badge variant="primary">A workspace for people & agents</Badge>
          <h1>
            Your business.
            <br />
            Your rules.
            <br />
            <span>Shared intelligence.</span>
          </h1>
          <p>Give your team and agents one place to work, with a clear definition of what can happen next.</p>
          <div className="auth-principles">
            <div>
              <Boxes />
              <span>Configure the business</span>
            </div>
            <div>
              <GitPullRequest />
              <span>Review proposed changes</span>
            </div>
            <div>
              <ShieldCheck />
              <span>Keep decisions accountable</span>
            </div>
          </div>
        </div>
        <p className="auth-footnote">Local development edition · Build and run business applications</p>
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap">
          <div className="feature-icon">
            <Workflow />
          </div>
          <h2>{signup ? 'Create your workspace' : 'Welcome back'}</h2>
          <p className="muted">
            {signup
              ? 'Kernel is invite-only. Enter the invitation code you were given, then create a private workspace.'
              : 'Sign in to continue working with your team and agents.'}
          </p>
          <Form
            onSubmit={async event => {
              event.preventDefault()
              setBusy(true)
              setError('')
              const values = new FormData(event.currentTarget)
              try {
                const credentials = {
                  email: String(values.get('email')),
                  password: String(values.get('password')),
                }
                const result = signup
                  ? await authClient.signUp.email({
                      ...credentials,
                      name: String(values.get('name')),
                      invitationCode: String(values.get('invitationCode')),
                    } as Parameters<typeof authClient.signUp.email>[0])
                  : await authClient.signIn.email(credentials)
                if (result.error) throw new Error(result.error.message || 'Unable to sign in.')
                await navigate({ to: pendingInvitation() ? '/settings' : '/' })
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Unable to sign in.')
              } finally {
                setBusy(false)
              }
            }}
          >
            <FieldGroup>
              {signup ? (
                <Field name="invitationCode" isRequired minLength={4} maxLength={80} defaultValue={invitationCode} autoFocus={!invitationCode}>
                  <FieldLabel>Invitation code</FieldLabel>
                  <Input placeholder="Enter your invitation code" autoComplete="off" autoCapitalize="none" spellCheck="false" />
                  <FieldDescription>Ask the person who invited you if you do not have one.</FieldDescription>
                </Field>
              ) : null}
              {signup ? (
                <Field name="name" isRequired minLength={2} maxLength={80} autoFocus={Boolean(invitationCode)}>
                  <FieldLabel>Your name</FieldLabel>
                  <Input placeholder="Alex Morgan" autoComplete="name" />
                </Field>
              ) : null}
              <Field name="email" type="email" isRequired autoFocus={!signup}>
                <FieldLabel>Email address</FieldLabel>
                <Input placeholder="alex@company.com" autoComplete="email" />
              </Field>
              <Field name="password" type="password" isRequired minLength={10}>
                <FieldLabel>Password</FieldLabel>
                <Input autoComplete={signup ? 'new-password' : 'current-password'} />
                {signup ? <FieldDescription>Use at least 10 characters.</FieldDescription> : null}
              </Field>
              {error ? <Alert variant="danger">{error}</Alert> : null}
              <Button type="submit" className="w-full" isDisabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {signup ? 'Create workspace' : 'Sign in'}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </Form>
          <div className="auth-toggle">
            <span>{signup ? 'Already have a workspace?' : 'Have an invitation code?'}</span>
            <Button variant="ghost" size="sm" onPress={() => setMode(signup ? 'login' : 'signup')}>
              {signup ? 'Sign in' : 'Create an account'}
            </Button>
          </div>
          <p className="auth-note">{signup ? 'Accounts are invite-only. Records stay in your workspace database. Connected agents send the description or selected project context to your configured model.' : 'Records stay in your local database. Connected agents send the description or selected project context to your configured model.'}</p>
        </div>
      </section>
    </main>
  )
}
