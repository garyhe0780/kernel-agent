import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { docs, findDoc, searchDocs } from '../src/content/docs'
import { KernelLanding } from '../src/components/kernel-landing'
import { KernelDocs } from '../src/components/kernel-docs'

test('documentation navigation has unique routes, anchors, and valid related guides', () => {
  assert.equal(new Set(docs.map(page => page.slug)).size, docs.length)
  for (const page of docs) {
    assert.equal(new Set(page.sections.map(s => s.id)).size, page.sections.length)
    for (const section of page.sections) for (const link of section.links ?? []) assert.ok(findDoc(link.slug), `${page.slug}: missing ${link.slug}`)
  }
  assert.equal(findDoc('missing-guide'), undefined)
})

test('documentation search matches content and multiple terms without requiring a server', () => {
  assert.ok(searchDocs(' MCP bearer ').some(page => page.slug === 'connect-agents'))
  assert.ok(searchDocs('revocation').some(page => page.slug === 'connect-agents'))
  assert.deepEqual(searchDocs('phrase-that-does-not-exist'), [])
  assert.equal(searchDocs('  ').length, docs.length)
})

test('public pages render meaningful content without a session or database', () => {
  const landing = renderToStaticMarkup(createElement(KernelLanding))
  assert.match(landing, /Kernel runtime/)
  assert.match(landing, /Illustrative data/)
  assert.match(landing, /href="\/workspace"/)
  assert.equal((landing.match(/<h1/g) ?? []).length, 1)
  for (const page of docs) {
    const html = renderToStaticMarkup(createElement(KernelDocs, { page }))
    assert.equal((html.match(/<h1/g) ?? []).length, 1)
    assert.match(html, /Search documentation/)
    assert.match(html, /id="public-main"/)
    assert.ok(html.includes(page.title))
    for (const section of page.sections) assert.ok(html.includes(`id="${section.id}"`))
  }
})
