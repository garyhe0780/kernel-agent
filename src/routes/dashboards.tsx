import { createFileRoute } from '@tanstack/react-router'
import { DashboardGallery } from '@/components/dashboard-gallery'

export const Route = createFileRoute('/dashboards')({
  head: () => ({
    meta: [
      { title: 'Dashboard collection — Kernel' },
      {
        name: 'description',
        content:
          'Six interactive dashboard examples: analytics, sales, commerce, finance, projects and support.',
      },
    ],
  }),
  component: DashboardGallery,
})
