import { Tag, Typography } from 'antd'
import DataTable, { bytes, dateTime } from './DataTable.jsx'
import { loadFileLink, loadRunLink } from './records.jsx'

const statusColors = { ok: 'green', failed: 'red', running: 'blue' }
export const statusTag = (v) => v && <Tag color={statusColors[v]}>{v}</Tag>
export const statusFilters = (...values) => values.map((v) => ({ text: v, value: v }))

export const count = (v) => v?.toLocaleString('en-US')
export const errorText = (v) =>
  v && (
    <Typography.Text type="danger" ellipsis={{ tooltip: v }} style={{ maxWidth: 360 }}>
      {v}
    </Typography.Text>
  )

const tables = ['vervent_contracts', 'vervent_assets', 'vervent_transactions', 'copart_inventory', 'copart_sales']

export const columns = [
  { title: 'File', dataIndex: 'source_file', fixed: 'left', render: (v, f) => loadFileLink(f.id, v) },
  { title: 'File Date', dataIndex: 'file_date' },
  { title: 'Table', dataIndex: 'table_name', filters: tables.map((v) => ({ text: v, value: v })) },
  { title: 'Status', dataIndex: 'status', filters: statusFilters('ok', 'failed'), render: statusTag },
  { title: 'Rows', dataIndex: 'rows_in_file', align: 'right', render: count },
  { title: 'Inserted', dataIndex: 'inserted', align: 'right', render: count },
  { title: 'Updated', dataIndex: 'updated', align: 'right', render: count },
  { title: 'Unchanged', dataIndex: 'skipped', align: 'right', render: count },
  { title: 'Size', dataIndex: 'bytes', align: 'right', render: bytes },
  { title: 'Loaded', dataIndex: 'finished_at', render: dateTime },
  { title: 'Run', dataIndex: 'run_id', render: (v) => loadRunLink(v) },
  { title: 'Error', dataIndex: 'error', render: errorText },
]

export default function LoadFiles() {
  return (
    <DataTable
      endpoint="/api/loads/files"
      rowKey="id"
      columns={columns}
      noun="files"
      defaultSort="-finished_at"
      urlState
    />
  )
}
