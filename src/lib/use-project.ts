import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'

export function useProject(projectSlug: string) {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const keys = useRef(new Map<string, string>())

  async function refresh() {
    const next = await request<Snapshot>(`/api/kernel?project=${encodeURIComponent(projectSlug)}`)
    setSnapshot(next)
    return next
  }

  useEffect(() => {
    if (!session.data) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    setError('')
    request<Snapshot>(`/api/kernel?project=${encodeURIComponent(projectSlug)}`)
      .then(next => { if (!cancelled) setSnapshot(next) })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load the project.') })
    return () => { cancelled = true }
  }, [session.data?.user.id, projectSlug])

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
      toast.success(label)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The operation could not complete.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return { session, snapshot, error, setError, busy, run, refresh, keys }
}
