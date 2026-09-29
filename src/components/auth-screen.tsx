import { pendingInvitation } from '@/lib/pending-invitation'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Boxes, GitPullRequest, ShieldCheck, Workflow } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from './ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { PasswordRecovery } from './password-recovery'
import { PasswordField } from './password-field'
import { Alert, Badge, Spinner } from './ui/surfaces'

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'reset-done'

export function AuthScreen({ mode, invitationCode = '', applicationInvite = '', token, resetError }: { mode: AuthMode; invitationCode?: string; applicationInvite?: string; token?: string; resetError?: string }) {
  const navigate = useNavigate({ from: '/login' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const signup = mode === 'signup'

  function setMode(next: AuthMode) {
    setError('')
    void navigate({ search: { mode: next, ...(applicationInvite ? { app: applicationInvite } : {}), ...(invitationCode ? { code: invitationCode } : {}) } })
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
          {mode === 'forgot' || mode === 'reset' || mode === 'reset-done' ? (
            <PasswordRecovery key={`${mode}:${token || ''}:${resetError || ''}`} mode={mode} token={token} resetError={resetError} email={email} onEmailChange={setEmail} onModeChange={setMode} onResetComplete={async () => {
              await navigate({ replace: true, search: { mode: 'reset-done', ...(applicationInvite ? { app: applicationInvite } : {}), ...(invitationCode ? { code: invitationCode } : {}) } })
            }} applicationInvite={applicationInvite} invitationCode={invitationCode} />
          ) : <>
            <h2>{applicationInvite ? (signup ? 'Join this application' : 'Sign in to this application') : signup ? 'Create your workspace' : 'Welcome back'}</h2>
            <p className="muted">
              {applicationInvite
                ? 'Use the email address that was invited. You do not need a workspace invitation code.'
                : signup
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
                        ...(applicationInvite ? { applicationInvite } : { invitationCode: String(values.get('invitationCode')) }),
                      } as Parameters<typeof authClient.signUp.email>[0])
                    : await authClient.signIn.email(credentials)
                  if (result.error) throw new Error(result.error.message || 'Unable to sign in.')
                  if (applicationInvite) return
                  await navigate({ to: pendingInvitation() ? '/settings' : '/workspace' })
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Unable to sign in.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <FieldGroup>
                {signup && !applicationInvite ? (
                  <Field name="invitationCode" isRequired minLength={4} maxLength={80} defaultValue={invitationCode} autoFocus={!invitationCode}>
                    <FieldLabel>Invitation code</FieldLabel>
                    <Input placeholder="Enter your invitation code" autoComplete="off" autoCapitalize="none" spellCheck="false" />
                    <FieldDescription>Ask the person who invited you if you do not have one.</FieldDescription>
                  </Field>
                ) : null}
                {signup ? (
                  <Field name="name" isRequired minLength={2} maxLength={80} autoFocus={Boolean(invitationCode || applicationInvite)}>
                    <FieldLabel>Your name</FieldLabel>
                    <Input placeholder="Alex Morgan" autoComplete="name" />
                  </Field>
                ) : null}
                <Field name="email" type="email" isRequired autoFocus={!signup} value={email} onChange={setEmail}>
                  <FieldLabel>Email address</FieldLabel>
                  <Input placeholder="alex@company.com" autoComplete="email" />
                </Field>
                <PasswordField key={mode} label="Password" autoComplete={signup ? 'new-password' : 'current-password'} newPassword={signup}
                  labelAction={!signup ? <Button type="button" variant="link" size="sm" className="password-recovery-link" isDisabled={busy} onPress={() => setMode('forgot')}>Forgot password?</Button> : null}
                />
                {error ? <Alert variant="danger">{error}</Alert> : null}
                <Button type="submit" className="w-full" isDisabled={busy}>
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  {applicationInvite ? 'Continue' : signup ? 'Create workspace' : 'Sign in'}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </FieldGroup>
            </Form>
            <div className="auth-toggle">
              <span>{signup ? 'Already have a workspace?' : 'Have an invitation code?'}</span>
              <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => setMode(signup ? 'login' : 'signup')}>
                {signup ? 'Sign in' : 'Create an account'}
              </Button>
            </div>
          </>}
          <p className="auth-note">{signup ? 'Accounts are invite-only. Records stay in your workspace database. Connected agents send the description or selected project context to your configured model.' : 'Records stay in your local database. Connected agents send the description or selected project context to your configured model.'}</p>
        </div>
      </section>
    </main>
  )
}
