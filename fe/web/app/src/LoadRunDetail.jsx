import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { dateTime } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { columns as fileColumns, statusTag } from './LoadFiles.jsx'
import { duration } from './LoadRuns.jsx'
import { useRecord } from './records.jsx'

// LoadRunDetail is /loads/runs/:id: one loader invocation and the files it attempted.
export default function LoadRunDetail() {
  const { id } = useParams()
  const { record: run, error } = useRecord(`/api/loads/runs/${encodeURIComponent(id)}`)

  const crumbs = (
    <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <Link to="/loads/runs">Load Runs</Link> }, { title: id }]} />
  )
  if (run === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load run ${id}: ${error}`} /></>
  if (run === null) return <>{crumbs}<Result status="404" title={`Run ${id} not found`} /></>

  return (
    <>
      {crumbs}
      <PageHeader
        title={`Run ${run.id}`}
        subtitle={`${run.loader} loader · ${dateTime(run.started_at)}`}
        extra={statusTag(run.status)}
      />
      <Flex vertical gap="large">
        {run.error && <Alert type="error" showIcon message={run.error} />}
        {run.status === 'running' && (
          <Alert
            type="info"
            showIcon
            message="This run has not finished. If it started long ago, the loader process died before it could record the outcome."
          />
        )}
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Loader', children: run.loader },
              { label: 'Started', children: dateTime(run.started_at) },
              { label: 'Finished', children: dateTime(run.finished_at) },
              { label: 'Duration', children: duration(run.started_at, run.finished_at) },
              { label: 'Invoked By', children: run.invoked_by },
              { label: 'Files Given', children: run.args?.length },
            ]}
          />
        </Card>
        <div>
          <Typography.Title level={5}>Files attempted</Typography.Title>
          <DataTable
            endpoint="/api/loads/files"
            rowKey="id"
            columns={fileColumns.filter((c) => c.dataIndex !== 'run_id')}
            noun="files"
            baseFilters={{ run_id: run.id }}
            defaultSort="id"
            pageSize={10}
          />
        </div>
      </Flex>
    </>
  )
}
