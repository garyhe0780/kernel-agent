import type { ReactNode } from 'react'
import { Layers3, ArrowUpRight } from 'lucide-react'

function PublicBrand() {
  return <a className="public-brand" href="/" aria-label="Kernel home">
    <Layers3 aria-hidden="true" />
    <span>kernel<span className="public-brand-dot">.</span></span>
  </a>
}

export function PublicShell({ children, documentation = false }: { children: ReactNode; documentation?: boolean }) {
  return <div className={`kernel-public${documentation ? ' kernel-public-docs' : ''}`}>
    <a className="public-skip" href="#public-main">Skip to content</a>
    <header className="public-header">
      <PublicBrand />
      <nav aria-label="Main navigation"><a href="/#architecture">Architecture</a><a href="/docs" aria-current={documentation ? 'page' : undefined}>Documentation</a><a className="public-workspace-link" href="/workspace">Open workspace <ArrowUpRight aria-hidden="true" /></a></nav>
    </header>
    {children}
    {!documentation && <footer className="public-footer">
      <div className="public-footer-identity">
        <PublicBrand />
        <p>A shared foundation for people and agents.</p>
      </div>
      <nav aria-label="Footer">
        <a href="/docs/current-scope">Current scope</a>
        <a href="/docs/quickstart">Get started</a>
        <a href="/workspace">Workspace <ArrowUpRight aria-hidden="true" /></a>
      </nav>
    </footer>}
  </div>
}
