import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpenText, Search } from 'lucide-react'
import { docs, searchDocs, type DocPage } from '@/content/docs'
import { PublicShell } from './public-shell'
import { Field, FieldLabel } from './ui/form-field'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function KernelDocs({ page }: { page: DocPage }) {
  const [query, setQuery] = useState('')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(page.sections[0]?.id ?? '')
  const [searchShortcut, setSearchShortcut] = useState('⌘K')
  const matches = searchDocs(query)
  const index = docs.findIndex(item => item.slug === page.slug)
  const previous = docs[index - 1], next = docs[index + 1]

  useEffect(() => {
    const updateActiveSection = () => {
      let current = page.sections[0]?.id ?? ''
      for (const section of page.sections) {
        const element = document.getElementById(section.id)
        if (element && element.getBoundingClientRect().top <= 160) current = section.id
      }
      setActiveSection(current)
    }
    updateActiveSection()
    window.addEventListener('scroll', updateActiveSection, { passive: true })
    window.addEventListener('resize', updateActiveSection)
    return () => {
      window.removeEventListener('scroll', updateActiveSection)
      window.removeEventListener('resize', updateActiveSection)
    }
  }, [page])

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setSearchShortcut('Ctrl K')
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setNavigationOpen(true)
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.docs-search input')?.focus())
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return <PublicShell documentation>
    <div className="docs-layout public-container">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <a className="docs-title" href="/docs"><BookOpenText aria-hidden="true" /> Documentation</a>
        <Button className="docs-mobile-nav-toggle" variant="outline" aria-expanded={navigationOpen} aria-controls="docs-navigation" onPress={() => setNavigationOpen(open => !open)}>{navigationOpen ? 'Hide guides' : 'Browse guides'}</Button>
        <p className="docs-current-guide">{page.title}</p>
        <div id="docs-navigation" className="docs-nav-content" data-open={navigationOpen}>
        <div className="docs-search"><Field value={query} onChange={setQuery}><FieldLabel>Search documentation</FieldLabel><div className="docs-search-control"><Search aria-hidden="true" /><Input placeholder="Search guides…" aria-keyshortcuts="Meta+K Control+K" onKeyDown={event => { if (event.key === 'Escape' && query) setQuery('') }} />{query ? null : <kbd className="docs-search-shortcut" aria-hidden="true">{searchShortcut}</kbd>}</div></Field></div>
        {query.trim() ? <p className="docs-search-status" role="status">{matches.length} {matches.length === 1 ? 'guide' : 'guides'} found</p> : null}
        {(['Start here', 'Build and operate', 'Reference'] as const).map(group => {
          const pages = matches.filter(item => item.group === group)
          return pages.length ? <nav key={group} aria-label={group}><h2>{group}</h2>{pages.map(item => <a href={`/docs/${item.slug}`} key={item.slug} aria-current={item.slug === page.slug ? 'page' : undefined}>{item.title}</a>)}</nav> : null
        })}
        {matches.length === 0 ? <p>No guides match “{query}”. Try “MCP”, “review”, or “model”.</p> : null}
        </div>
      </aside>
      <main className="docs-article" id="public-main"><header><p className="docs-breadcrumb"><a href="/docs">Docs</a><span aria-hidden="true"> / </span>{page.group}</p><h1>{page.title}</h1><p className="docs-description">{page.description}</p></header>
        <details className="docs-mobile-toc"><summary>On this page</summary><nav aria-label="Page sections">{page.sections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav></details>
        {page.sections.map(section => <section id={section.id} key={section.id}><h2><a href={`#${section.id}`}>{section.title}</a></h2>{section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}{section.steps ? <ol>{section.steps.map(item => <li key={item}>{item}</li>)}</ol> : null}{section.code ? <figure className="docs-code"><figcaption>{section.code.language}</figcaption><pre tabIndex={0} aria-label={`${section.title} code example`}><code>{section.code.value}</code></pre></figure> : null}{section.links ? <div className="docs-related">{section.links.map(link => <a key={link.slug} href={`/docs/${link.slug}`}>{link.label}<ArrowRight aria-hidden="true" /></a>)}</div> : null}</section>)}
        <nav className="docs-pagination" aria-label="Adjacent guides">{previous ? <a href={`/docs/${previous.slug}`}><ArrowLeft aria-hidden="true" /><span><small>Previous</small>{previous.title}</span></a> : <span />}{next ? <a href={`/docs/${next.slug}`}><span><small>Next</small>{next.title}</span><ArrowRight aria-hidden="true" /></a> : <a href="/workspace">Open workspace <ArrowRight aria-hidden="true" /></a>}</nav>
      </main>
      <aside className="docs-toc"><nav aria-label="On this page"><h2>On this page</h2>{page.sections.map(section => <a href={`#${section.id}`} key={section.id} aria-current={section.id === activeSection ? 'location' : undefined}>{section.title}</a>)}</nav></aside>
    </div>
  </PublicShell>
}
