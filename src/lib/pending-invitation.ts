const key = 'kernel:pending-invitation'
export function pendingInvitation() {
  if (typeof window === 'undefined') return ''
  try { return sessionStorage.getItem(key) || '' } catch { return '' }
}
export function rememberInvitation(token: string) {
  try { sessionStorage.setItem(key, token) } catch { /* The original invitation URL remains a fallback. */ }
}
export function clearInvitation() {
  try { sessionStorage.removeItem(key) } catch { /* No stored invitation is available. */ }
}
