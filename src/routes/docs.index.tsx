import { createFileRoute } from '@tanstack/react-router'
import { KernelDocs } from '@/components/kernel-docs'
import { docs } from '@/content/docs'
export const Route = createFileRoute('/docs/')({
  head: () => ({ meta: [{ title: 'Documentation — Kernel' }, { name: 'description', content: docs[0].description }] }),
  component: () => <KernelDocs page={docs[0]} />,
})
