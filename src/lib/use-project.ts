import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { request, type Snapshot } from '@/lib/client'
import { snapshotRecordLimits } from '@/kernel/record-operations'

export function useProject(projectSlug: string) {
  const session = authClient.useSession()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const keys = useRef(new Map<string, string>())
  const limits = useRef<Record<string, number>>({})

  const path = () => `/api/kernel?${new URLSearchParams([['project', projectSlug], ...Object.entries(limits.current).map(([slug, count]) => ['expand', `${slug}:${count}`])])}`

  async function refresh() {
    const next = await request<Snapshot>(path())
    setSnapshot(next)
    return next
  }

  async function loadMore(capability: string) {
    const page = snapshot?.recordPages?.[capability]
    if (!page || page.loaded >= page.total) return
    limits.current = { ...limits.current, [capability]: Math.min(snapshotRecordLimits.max, page.loaded + snapshotRecordLimits.page) }
    setBusy(true)
    try { await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load more records.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    limits.current = {}
    if (!session.data) {
      setSnapshot(null)
      return
    }
    let cancelled = false
    setError('')
    request<Snapshot>(path())
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

  return { session, snapshot, error, setError, busy, run, refresh, loadMore, keys }
}
