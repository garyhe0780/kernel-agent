import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from './ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Spinner } from './ui/surfaces'
import { PasswordField } from './password-field'

export function PasswordRecovery({ mode, token, resetError, email, onEmailChange, onModeChange, onResetComplete, applicationInvite, invitationCode }: {
  mode: 'forgot' | 'reset' | 'reset-done'
  token?: string
  resetError?: string
  email: string
  onEmailChange: (email: string) => void
  onModeChange: (mode: 'login' | 'forgot') => void
  onResetComplete: () => Promise<void>
  applicationInvite: string
  invitationCode: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(mode === 'reset-done')
  const [invalidToken, setInvalidToken] = useState(false)
  const reset = mode !== 'forgot'
  const invalid = !complete && reset && (!token || Boolean(resetError) || invalidToken)

  return <>
    <h2>{complete ? reset ? 'Password updated' : 'Check your email' : reset ? 'Choose a new password' : 'Forgot password?'}</h2>
    <p className="muted">{complete
      ? reset ? 'Your password has been changed. Sign in with your new password.' : 'If an account matches that email, you’ll receive a reset link. Check your spam folder too. The link expires in one hour.'
      : reset ? 'Enter a new password for your account.' : 'Enter your account email and we’ll send you a password reset link.'}</p>
    {invalid ? <>
      <Alert variant="danger">This reset link is invalid or has expired. Request a new link to continue.</Alert>
      <Button onPress={() => onModeChange('forgot')}>Request a new link</Button>
    </> : !complete ? <Form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const values = new FormData(event.currentTarget)
      setError('')
      if (reset && values.get('password') !== values.get('confirmPassword')) {
        setError('Passwords do not match. Enter the same password in both fields.')
        return
      }
      setBusy(true)
      try {
        const redirect = new URL('/login', window.location.origin)
        redirect.searchParams.set('mode', 'reset')
        if (applicationInvite) redirect.searchParams.set('app', applicationInvite)
        if (invitationCode) redirect.searchParams.set('code', invitationCode)
        const result = reset
          ? await authClient.resetPassword({ token, newPassword: String(values.get('password')) })
          : await authClient.requestPasswordReset({ email: email.trim(), redirectTo: redirect.href })
        if (result.error) {
          if (reset && result.error.code === 'INVALID_TOKEN') setInvalidToken(true)
          throw new Error(result.error.message || 'Unable to complete your request. Please try again.')
        }
        if (reset) await onResetComplete()
        else setComplete(true)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to complete your request. Please try again.')
      } finally {
        setBusy(false)
      }
    }}>
      <FieldGroup>
        {reset ? <>
          <PasswordField label="New password" autoComplete="new-password" newPassword />
          <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" newPassword />
        </> : <Field name="email" type="email" isRequired autoFocus value={email} onChange={onEmailChange}>
          <FieldLabel>Email address</FieldLabel>
          <Input placeholder="alex@company.com" autoComplete="email" />
          <FieldError />
        </Field>}
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <Button type="submit" isDisabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {busy ? reset ? 'Updating password…' : 'Sending reset link…' : reset ? 'Reset password' : 'Send reset link'}
        </Button>
      </FieldGroup>
    </Form> : null}
    <Button type="button" variant="ghost" isDisabled={busy} onPress={() => onModeChange('login')}>Back to sign in</Button>
  </>
}
