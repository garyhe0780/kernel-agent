import { useEffect, useState } from 'react'
import { date, request, type PublicSitePayload } from '@/lib/client'
import { Alert, Skeleton } from '@/components/ui/surfaces'

export function PublicSite({ workspaceId }: { workspaceId: string }) {
  const [site, setSite] = useState<PublicSitePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    request<PublicSitePayload>(`/api/public/${workspaceId}`)
      .then(next => { if (!cancelled) setSite(next) })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'The public site could not be opened.') })
    return () => { cancelled = true }
  }, [workspaceId])

  if (error) return <main className="journal"><div className="journal-inner"><Alert variant="danger">{error}</Alert></div></main>
  if (!site) {
    return (
      <main className="journal">
        <div className="journal-inner">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    )
  }

  return (
    <main className="journal">
      <div className="journal-inner">
        <header className="journal-head">
          <a href="/">{site.workspace.name}</a>
          <span className="journal-example">Seeded example</span>
        </header>
        {site.blocks.length === 0 ? (
          <p className="journal-empty">Nothing published yet.</p>
        ) : site.blocks.map(block => (
          <section key={block.slug} className="journal-block">
            {block.view === 'hero' ? block.records.map(record => (
              <article className="journal-hero" key={record.id}>
                <h1>{String(record.data.title)}</h1>
                <p className="journal-standfirst">{String(record.data.standfirst)}</p>
                <p>{String(record.data.body)}</p>
              </article>
            )) : null}
            {block.view === 'article-list' ? (
              <div className="journal-notes">
                {block.records.map(record => (
                  <article className="journal-note" key={record.id}>
                    <time dateTime={typeof record.createdAt === 'string' ? record.createdAt : undefined}>{date(String(record.createdAt))}</time>
                    <h2>{String(record.data.title)}</h2>
                    <p className="journal-excerpt">{String(record.data.excerpt)}</p>
                    <p>{String(record.data.body)}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ))}
        <p className="journal-footnote">Drafts are not public. <a href="/workspace">Workspace</a></p>
      </div>
    </main>
  )
}
