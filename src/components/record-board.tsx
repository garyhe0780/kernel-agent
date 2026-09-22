import type { Definition, RecordData } from '@/kernel/definition'
import { shortId } from '@/lib/client'
import { statusLabel } from '@/lib/project-ui'

function plural(label: string) {
  if (label.endsWith('s')) return label
  return `${label}s`
}

export function RecordBoard({
  definition,
  records,
  selectedId,
  related,
  onSelect,
}: {
  definition: Definition
  records: { id: string; data: RecordData }[]
  selectedId?: string
  related: { id: string; data: RecordData }[]
  onSelect: (id: string) => void
}) {
  const statuses = definition.entity.fields.status?.options ?? []
  const noun = definition.entity.label.toLowerCase()
  return (
    <div className="record-board" role="region" aria-label={`${plural(definition.entity.label)} board`}>
      {statuses.map(value => {
        const column = records.filter(record => record.data.status === value)
        return (
          <section className="record-board-column" key={value} aria-label={statusLabel(value)}>
            <header>
              <h3>{statusLabel(value)}</h3>
              <span>{column.length}</span>
            </header>
            {column.length === 0 ? <p className="muted">No {plural(noun)}.</p> : column.map(record => (
              <button
                type="button"
                className="record-board-card"
                key={record.id}
                aria-pressed={record.id === selectedId}
                data-selected={record.id === selectedId}
                onClick={() => onSelect(record.id)}
              >
                <strong>{String(record.data.title)}</strong>
                <span>
                  {Object.entries(definition.entity.fields).filter(([key, field]) => key !== 'title' && key !== 'status' && field.reference).map(([key, field]) => {
                    const title = related.find(item => item.id === record.data[key])?.data.title
                    return title ? `${field.label} · ${String(title)}` : null
                  }).filter(Boolean).join(' · ') || `#${shortId(record.id)}`}
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
