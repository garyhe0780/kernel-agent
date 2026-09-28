import { createFileRoute, notFound } from '@tanstack/react-router'
import { KernelDocs } from '@/components/kernel-docs'
import { findDoc } from '@/content/docs'
import { PublicShell } from '@/components/public-shell'
export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => { const page = findDoc(params.slug); if (!page) throw notFound(); return page },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? 'Guide not found'} — Kernel docs` }, { name: 'description', content: loaderData?.description ?? 'Kernel documentation' }] }),
  component: () => <KernelDocs key={Route.useParams().slug} page={Route.useLoaderData()} />,
  notFoundComponent: () => <PublicShell documentation><main className="public-container public-missing" id="public-main"><h1>Guide not found</h1><p>Browse the documentation to find what you need.</p><a className="public-cta" href="/docs">Open documentation</a></main></PublicShell>,
})
