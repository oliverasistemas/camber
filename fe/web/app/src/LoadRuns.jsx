import DataTable, { dateTime } from './DataTable.jsx'
import { errorText, statusFilters, statusTag } from './LoadFiles.jsx'
import { loadRunLink } from './records.jsx'

// duration is the time between two timestamps, e.g. 0.8s or 2m 05s; blank while a run has no end.
export const duration = (from, to) => {
  if (!from || !to) return ''
  const s = (new Date(to) - new Date(from)) / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

const columns = [
  { title: 'Run', dataIndex: 'id', fixed: 'left', render: (v) => loadRunLink(v) },
  { title: 'Loader', dataIndex: 'loader', filters: statusFilters('vervent', 'copart') },
  { title: 'Started', dataIndex: 'started_at', render: dateTime },
  { title: 'Duration', dataIndex: 'finished_at', sorter: false, render: (v, r) => duration(r.started_at, v) },
  { title: 'Status', dataIndex: 'status', filters: statusFilters('ok', 'failed', 'running'), render: statusTag },
  { title: 'Files Given', dataIndex: 'args', align: 'right', sorter: false, render: (v) => v?.length },
  { title: 'Invoked By', dataIndex: 'invoked_by' },
  { title: 'Error', dataIndex: 'error', render: errorText },
]

export default function LoadRuns() {
  return (
    <DataTable endpoint="/api/loads/runs" rowKey="id" columns={columns} noun="runs" defaultSort="-started_at" urlState />
  )
}
