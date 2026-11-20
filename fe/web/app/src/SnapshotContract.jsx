import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { snapshotPath, title } from './Snapshots.jsx'
import { contractLink, useRecord } from './records.jsx'

const text = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

// SnapshotContract is /portfolio/snapshots/:id/contracts/:contractNo: one contract as a snapshot
// froze it. First the servicer-neutral fields the totals are computed from, then the servicer's
// whole row as it was, under the servicer's own column names.
export default function SnapshotContract() {
  const { id, contractNo } = useParams()
  const { record: s } = useRecord(`/api/snapshots/${encodeURIComponent(id)}`)
  const { record: c, error } = useRecord(`/api/snapshots/${encodeURIComponent(id)}/contracts/${encodeURIComponent(contractNo)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[
        { title: <Link to="/portfolio/snapshots">Snapshots</Link> },
        { title: <Link to={snapshotPath(id)}>{s ? title(s) : id}</Link> },
        { title: contractNo },
      ]}
    />
  )
  if (c === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load contract ${contractNo}: ${error}`} /></>
  if (c === null) return <>{crumbs}<Result status="404" title={`Contract ${contractNo} is not in snapshot ${id}`} /></>

  const servicerRow = Object.entries(c.servicer_row ?? {})

  return (
    <>
      {crumbs}
      <PageHeader
        title={`Contract ${c.contract_no}`}
        subtitle={`As of ${c.as_of}, in ${s ? title(s) : `snapshot ${id}`}`}
        extra={c.is_open != null && <Tag color={c.is_open ? 'green' : 'default'}>{c.is_open ? 'Open' : 'Closed'}</Tag>}
      />
      <Flex vertical gap="large">
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Portfolio', children: c.portfolio ?? 'Not in a portfolio' },
              { label: 'Status', children: c.status },
              { label: 'Commenced', children: c.commencement_date },
              { label: 'Maturity', children: c.maturity_date },
              { label: 'Term', children: c.term_months != null && `${c.term_months} mo` },
              { label: 'Orig Cost', children: money(c.original_cost) },
              { label: 'Residual', children: money(c.residual) },
              { label: 'Payment', children: money(c.monthly_payment) },
              { label: 'Outstanding', children: money(c.outstanding_receivables) },
              { label: 'Past Due', children: money(c.past_due) },
              { label: 'Days Del', children: c.days_delinquent },
              { label: 'Bucket', children: c.delinquency_bucket },
              { label: 'Contract Today', children: contractLink(c.contract_no) },
            ]}
          />
        </Card>
        <div>
          <Typography.Title level={5}>Servicer row</Typography.Title>
          <Typography.Paragraph type="secondary">
            Every field the servicer reported for this contract, as it was when the snapshot was taken.
          </Typography.Paragraph>
          {servicerRow.length > 0 ? (
            <Card>
              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2, lg: 3 }}
                items={servicerRow.map(([k, v]) => ({ key: k, label: k, children: text(v) }))}
              />
            </Card>
          ) : (
            <Alert type="info" showIcon message="This snapshot row has no servicer row stored." />
          )}
        </div>
      </Flex>
    </>
  )
}
