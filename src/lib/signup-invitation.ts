import { timingSafeEqual } from 'node:crypto'

export function normalizeSignupInvitation(value: string) {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function signupInvitationRejection(provided: unknown, configured: string | undefined) {
  const expected = configured ? normalizeSignupInvitation(configured) : ''
  if (!expected) return 'Kernel is invite-only. Ask an operator for an invitation code.'
  const submitted = typeof provided === 'string' ? normalizeSignupInvitation(provided) : ''
  const left = new TextEncoder().encode(submitted)
  const right = new TextEncoder().encode(expected)
  if (left.byteLength !== right.byteLength || !timingSafeEqual(left, right)) return 'That invitation code is not valid.'
  return null
}
