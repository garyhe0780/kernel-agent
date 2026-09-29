import { useState } from 'react'
import { Download } from 'lucide-react'
import type { Definition } from '@/kernel/definition'
import type { BusinessRecord } from '@/lib/client'
import { exportFilename, exportRecordsCsv } from '@/lib/record-export'
import { useAssignmentMembers } from './record-context'
import { Button } from './ui/button'

export function ExportRecords({ definition, records, related, name }: { definition: Definition; records: BusinessRecord[]; related: BusinessRecord[]; name: string }) {
  const members = useAssignmentMembers()
  const [error, setError] = useState('')
  return <div title="Export matching records with all fields. Amounts stay in stored cents; relationships include IDs and names.">
    <Button variant="outline" disabled={!records.length} aria-label={`Export ${records.length} matching record${records.length === 1 ? '' : 's'} as CSV, including all fields`} onPress={() => {
      setError('')
      let url: string | undefined
      try {
        const csv = exportRecordsCsv(definition, records, related, members)
        url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = exportFilename(name)
        document.body.append(link)
        try { link.click() } finally { link.remove() }
      } catch { setError('Export failed. Try again.') }
      finally { if (url) { const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) } }
    }}><Download data-icon="inline-start" />Export CSV</Button>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
  </div>
}
