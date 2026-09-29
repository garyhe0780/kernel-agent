import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PasswordRecovery } from '../src/components/password-recovery'

function render(mode: 'reset' | 'reset-done', token?: string, resetError?: string) {
  return renderToStaticMarkup(createElement(PasswordRecovery, {
    mode, token, resetError, email: '', applicationInvite: '', invitationCode: '',
    onEmailChange() {}, onModeChange() {}, async onResetComplete() {},
  }))
}

test('password reset confirmation survives remount and refresh after token removal', () => {
  const html = render('reset-done')
  assert.match(html, /Password updated/)
  assert.match(html, /Back to sign in/)
  assert.doesNotMatch(html, /invalid or has expired/)
  assert.doesNotMatch(html, /name="password"/)
})

test('missing or rejected reset links still offer recovery', () => {
  for (const html of [render('reset'), render('reset', 'test-token', 'INVALID_TOKEN')]) {
    assert.match(html, /invalid or has expired/)
    assert.match(html, /Request a new link/)
    assert.doesNotMatch(html, /name="password"/)
  }
  assert.match(render('reset', 'test-token'), /name="password"/)
})
