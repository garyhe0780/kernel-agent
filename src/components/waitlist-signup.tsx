import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from './ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, Form } from './ui/form-field'
import { Input } from './ui/input'
import { Alert, Spinner } from './ui/surfaces'

export function WaitlistSignup() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const confirmation = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (joined) confirmation.current?.focus()
    else if (error) emailInput.current?.focus()
  }, [joined, error])

  return <section className="public-container public-waitlist" id="waitlist" aria-labelledby="waitlist-title">
    <div><h2 id="waitlist-title">Join the waitlist.</h2><p>Interested in Kernel? Leave your email to register your interest.</p></div>
    <div className="public-waitlist-form">
      <div ref={confirmation} tabIndex={joined ? -1 : undefined} aria-live="polite" aria-atomic="true">{joined ? <Alert>You’re on the list. Your interest in Kernel has been saved.</Alert> : null}</div>
      {!joined ? <Form aria-label="Join the waitlist" aria-busy={busy} onSubmit={async event => {
        event.preventDefault()
        if (submitting.current) return
        submitting.current = true
        setBusy(true)
        setError('')
        try {
          const response = await fetch('/api/waitlist', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim() }), signal: AbortSignal.timeout(15000),
          })
          const result = await response.json()
          if (!response.ok || result.joined !== true) throw new Error(result.error || 'We couldn’t save your email. Please try again.')
          setJoined(true)
        } catch (caught) {
          setError(caught instanceof Error && caught.name === 'Error' ? caught.message : 'We couldn’t save your email. Check your connection and try again.')
        } finally {
          submitting.current = false
          setBusy(false)
        }
      }}>
        <FieldGroup>
          <Field name="email" type="email" isRequired maxLength={254} value={email} onChange={setEmail} isDisabled={busy}>
            <FieldLabel>Email address</FieldLabel>
            <Input ref={emailInput} autoComplete="email" placeholder="you@company.com" />
            <FieldError />
          </Field>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Button type="submit" isDisabled={busy} size="lg">{busy ? <Spinner data-icon="inline-start" /> : null}{busy ? 'Joining…' : 'Join the waitlist'}{!busy ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}</Button>
          <p className="public-waitlist-note">Joining registers your interest. It doesn’t create an account or grant access.</p>
        </FieldGroup>
      </Form> : null}
    </div>
  </section>
}
