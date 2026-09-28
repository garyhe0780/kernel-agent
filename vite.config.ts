import { cpSync } from 'node:fs'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const cloudflareEnabled = process.env.CLOUDFLARE === '1'
const root = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  define: {
    __KERNEL_CLOUDFLARE__: JSON.stringify(cloudflareEnabled),
  },
  resolve: {
    alias: {
      '@': root('./src'),
      ...(!cloudflareEnabled ? { 'cloudflare:workers': root('./src/lib/cloudflare-workers-stub.ts') } : {}),
    },
  },
  // Preserve the TanStack versions resolved for each Start dependency in the
  // server bundle; externalizing it can select an older root installation.
  ssr: { noExternal: [/^@tanstack\//] },
  plugins: [
    ...(!cloudflareEnabled ? [{
      name: 'kernel-node-migrations',
      apply: 'build' as const,
      closeBundle() {
        cpSync(root('./prisma/migrations'), root('./dist/prisma/migrations'), { recursive: true })
      },
    }] : []),
    ...(cloudflareEnabled ? [cloudflare({ viteEnvironment: { name: 'ssr' } })] : []),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
})
