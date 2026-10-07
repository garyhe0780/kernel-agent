import { createFileRoute, redirect } from '@tanstack/react-router'
import { KernelLanding } from '@/components/kernel-landing'
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { workspace?: string } => typeof search.workspace === 'string' ? { workspace: search.workspace } : {},
  beforeLoad: ({ search }) => { if (search.workspace) throw redirect({ to: '/workspace', search: { workspace: search.workspace } }) },
  head: () => ({ meta: [{ title: 'Kernel — The runtime for your whole team — including agents.' }, { name: 'description', content: 'Define your business once. Give people and agents the interfaces, rules, and workflows to run it together.' }] }),
  component: KernelLanding,
})
