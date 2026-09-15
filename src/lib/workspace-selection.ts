const storageKey = 'kernel:active-workspace'
/** Resolve once per page so an in-flight request keeps the workspace it started with. */
let selection: string | undefined
export function workspaceHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  if (selection === undefined) {
    const requested = new URL(window.location.href).searchParams.get('workspace')
    if (requested === 'default') {
      sessionStorage.removeItem(storageKey)
      selection = ''
    } else if (requested) {
      // Fail before any request if the browser cannot retain this selection.
      sessionStorage.setItem(storageKey, requested)
      selection = requested
    } else selection = sessionStorage.getItem(storageKey) || ''
  }
  return selection ? { 'x-kernel-workspace': selection } : {}
}
export function clearWorkspaceSelection() {
  selection = ''
  sessionStorage.removeItem(storageKey)
}
