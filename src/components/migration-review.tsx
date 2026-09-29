import { Alert, Badge } from './ui/surfaces'
import type { MigrationPreview } from '@/kernel/migration'

export function MigrationReview({ preview, stale }: { preview: MigrationPreview; stale: boolean }) {
  const { report } = preview
  return <section className="migration-review stack" aria-label="Live-data migration preview">
    <div><h3>Changes to the live application</h3><p className="muted">Version {preview.projectVersion} → {preview.projectVersion + 1}</p></div>
    {stale ? <Alert variant="warning">The draft changed. Preview again before publishing.</Alert> : <Badge variant="warning">{report.canPublish ? 'Ready for review' : 'Changes blocked'}</Badge>}
    <p>{report.recordCount} existing records checked. {report.updatedRecordCount} will be updated.{report.deletedRecordCount || report.removedValueCount ? '' : ' No records or stored values will be deleted.'}</p>
    {report.deletedRecordCount || report.removedValueCount || report.entities.some(e => e.removed) ? <Alert variant="danger"><strong>Publishing permanently deletes data.</strong> {report.deletedRecordCount} records from removed entities and {report.removedValueCount} stored values from removed fields will be deleted. Version history keeps definitions, not deleted values.</Alert> : null}
    {report.invalidatedProposals ? <Alert variant="warning">{report.invalidatedProposals} pending proposals will become stale. Proposals for removed entities are rejected; reject and restage the others after publishing.</Alert> : <p className="muted">No pending proposals will be invalidated.</p>}
    <dl className="kv">{report.entities.map(e => <div className="builder-field" key={e.slug}><dt>{e.name}</dt><dd>{e.removed ? `Removed · ${e.records} records deleted` : e.added ? 'New entity · starts empty' : `${e.records} records · ${e.updatedRecords} updated`}</dd></div>)}</dl>
    {report.blockerCount ? <Alert variant="danger"><strong>{report.blockerCount} issues prevent publication</strong><ul className="builder-assumptions">{report.blockers.map((b, i) => <li key={i}>{b.entity}: {b.message}{b.recordId ? ` (record ${b.recordId.slice(-6)})` : ''}</li>)}</ul>{report.blockerCount > report.blockers.length ? <p>Showing the first {report.blockers.length} issues.</p> : null}</Alert> : null}
    <details open><summary>Definition changes ({report.changes.length})</summary><div className="stack">{report.changes.length ? report.changes.map((c, i) => <div className="migration-change" key={i}><strong>{c.entity} · {c.label}</strong><dl><dt>Before</dt><dd>{c.before}</dd><dt>After</dt><dd>{c.after}</dd></dl></div>) : <p>No definition changes.</p>}</div></details>
    {report.examples.length ? <details open><summary>Record preview (up to 5 examples)</summary>{report.examples.map((e, i) => <div className="migration-change" key={i}><strong>{e.entity} · {e.title}</strong>{e.fields.map(f => <p key={f.label}>{f.label}: {f.before} → {f.after}</p>)}</div>)}</details> : null}
  </section>
}
