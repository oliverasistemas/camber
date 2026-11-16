import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { bytes, dateTime } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { columns, count, statusTag } from './LoadFiles.jsx'
import { duration } from './LoadRuns.jsx'
import { loadRunLink, useRecord } from './records.jsx'

// The list page of each table a file can load into, for the link to the rows that came from it.
const tablePages = {
  vervent_contracts: '/vervent/contracts',
  vervent_assets: '/vervent/assets',
  vervent_transactions: '/vervent/transactions',
  copart_inventory: '/copart/inventory',
  copart_sales: '/copart/sales',
}

// LoadFileDetail is /loads/files/:id: one attempt to load a file, its run, the rows that still
// carry the file as their source, and every other attempt at the same file name.
export default function LoadFileDetail() {
  const { id } = useParams()
  const { record: f, error } = useRecord(`/api/loads/files/${encodeURIComponent(id)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to="/loads/files">Loaded Files</Link> }, { title: f?.source_file ?? id }]}
    />
  )
  if (f === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load file ${id}: ${error}`} /></>
  if (f === null) return <>{crumbs}<Result status="404" title={`Loaded file ${id} not found`} /></>

  const page = tablePages[f.table_name]

  return (
    <>
      {crumbs}
      <PageHeader
        title={f.source_file}
        subtitle={`${f.table_name ?? 'Unknown table'} · loaded ${dateTime(f.finished_at)}`}
        extra={statusTag(f.status)}
      />
      <Flex vertical gap="large">
        {f.error && <Alert type="error" showIcon message={f.error} />}
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Run', children: loadRunLink(f.run_id) },
              { label: 'File Date', children: f.file_date },
              { label: 'Table', children: f.table_name },
              { label: 'Size', children: bytes(f.bytes) },
              { label: 'Rows in File', children: count(f.rows_in_file) },
              { label: 'Inserted', children: count(f.inserted) },
              { label: 'Updated', children: count(f.updated) },
              { label: 'Unchanged', children: count(f.skipped) },
              { label: 'Started', children: dateTime(f.started_at) },
              { label: 'Finished', children: dateTime(f.finished_at) },
              { label: 'Duration', children: duration(f.started_at, f.finished_at) },
              {
                label: 'Current Rows',
                children: page && f.status === 'ok' && (
                  <Link to={`${page}?source_file=${encodeURIComponent(f.source_file)}`}>Rows last loaded from this file</Link>
                ),
              },
              {
                label: 'SHA-256',
                span: 'filled',
                children: f.sha256 && <Typography.Text code copyable>{f.sha256}</Typography.Text>,
              },
            ]}
          />
        </Card>
        <div>
          <Typography.Title level={5}>Every attempt at this file</Typography.Title>
          <DataTable
            endpoint="/api/loads/files"
            rowKey="id"
            columns={columns.filter((c) => c.dataIndex !== 'file_date' && c.dataIndex !== 'table_name')}
            noun="attempts"
            baseFilters={{ source_file: f.source_file }}
            defaultSort="-finished_at"
            pageSize={10}
          />
        </div>
      </Flex>
    </>
  )
}
