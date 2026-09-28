import { createFileRoute, redirect } from '@tanstack/react-router'
import { KernelLanding } from '@/components/kernel-landing'
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { workspace?: string } => typeof search.workspace === 'string' ? { workspace: search.workspace } : {},
  beforeLoad: ({ search }) => { if (search.workspace) throw redirect({ to: '/workspace', search: { workspace: search.workspace } }) },
  head: () => ({ meta: [{ title: 'Kernel — Business applications for people and agents' }, { name: 'description', content: 'Build business applications with shared definitions, human interfaces, and structured agent contracts. Explore Kernel’s runtime, MCP tools, and documentation.' }] }),
  component: KernelLanding,
})
