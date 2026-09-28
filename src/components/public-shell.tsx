import type { ReactNode } from 'react'
import { Layers3, ArrowUpRight } from 'lucide-react'

export function PublicShell({ children, documentation = false }: { children: ReactNode; documentation?: boolean }) {
  return <div className="kernel-public">
    <a className="public-skip" href="#public-main">Skip to content</a>
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="Kernel home"><Layers3 aria-hidden="true" /><span>kernel<span className="public-brand-dot">.</span></span></a>
      <nav aria-label="Main navigation"><a href="/#architecture">Architecture</a><a href="/docs" aria-current={documentation ? 'page' : undefined}>Documentation</a><a className="public-workspace-link" href="/workspace">Open workspace <ArrowUpRight aria-hidden="true" /></a></nav>
    </header>
    {children}
    <footer className="public-footer"><a className="public-brand" href="/">kernel.</a><p>A shared foundation for people and agents.</p><nav aria-label="Footer"><a href="/docs/current-scope">Current scope</a><a href="/docs/quickstart">Get started</a><a href="/workspace">Workspace</a></nav></footer>
  </div>
}
