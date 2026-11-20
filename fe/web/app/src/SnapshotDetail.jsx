import { Alert, Breadcrumb, Card, Col, Descriptions, Flex, Result, Row, Spin, Statistic, Table, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { dateTime, money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import PageHeader from './PageHeader.jsx'
import { count, kindTag, rate, snapshotPath, title } from './Snapshots.jsx'
import { useRecord } from './records.jsx'
import { portfolioColumn, usePortfolios } from './portfolios.jsx'

export const contractKey = (r) => `${r.snapshot_id}|${r.contract_no}`
export const contractPath = (r) => `${snapshotPath(r.snapshot_id)}/contracts/${encodeURIComponent(r.contract_no)}`

// One row per contract in a snapshot (portfolio_snapshot_contract_list): the contract as it was
// when the snapshot was taken. Each row links to its page in the snapshot.
export const contractColumns = [
  { title: 'As of', dataIndex: 'as_of', fixed: 'left', render: (v, r) => <Link to={contractPath(r)}>{v}</Link> },
  { title: 'Contract', dataIndex: 'contract_no', render: (v, r) => <Link to={contractPath(r)}>{v}</Link> },
  {
    title: 'Open',
    dataIndex: 'is_open',
    filters: [
      { text: 'Open', value: 'true' },
      { text: 'Closed', value: 'false' },
    ],
    render: (v) => v != null && <Tag color={v ? 'green' : 'default'}>{v ? 'Open' : 'Closed'}</Tag>,
  },
  { title: 'Status', dataIndex: 'status' },
  { title: 'Outstanding', dataIndex: 'outstanding_receivables', align: 'right', render: money },
  { title: 'Past Due', dataIndex: 'past_due', align: 'right', render: money },
  {
    title: 'Days Del',
    dataIndex: 'days_delinquent',
    align: 'right',
    render: (v) => (v > 0 ? <Typography.Text type="danger">{v}</Typography.Text> : v),
  },
  { title: 'Bucket', dataIndex: 'delinquency_bucket' },
  { title: 'Payment', dataIndex: 'monthly_payment', align: 'right', render: money },
  { title: 'Residual', dataIndex: 'residual', align: 'right', render: money },
  { title: 'Maturity', dataIndex: 'maturity_date' },
]

// Every row here has the snapshot's date, so the table drops that column; the portfolio follows the contract.
const columns = (portfolios) =>
  contractColumns
    .filter((c) => c.dataIndex !== 'as_of')
    .flatMap((c) => (c.dataIndex === 'contract_no' ? [c, portfolioColumn(portfolios, 'portfolio')] : [c]))

// ByPortfolio: the snapshot's totals per portfolio (/api/snapshots/:id/portfolios), computed from
// its rows with the formulas of its own totals. A portfolio filters the contract table below to
// its rows. A snapshot taken before the lease list was loaded also holds leases that are not
// Camber's; they are its last row.
function ByPortfolio({ id, rows }) {
  const { record: totals } = useRecord(`/api/snapshots/${encodeURIComponent(id)}/portfolios`)
  if (!totals?.length) return null
  const right = { align: 'right' }
  return (
    <div>
      <Typography.Title level={5}>By portfolio</Typography.Title>
      <Card styles={{ body: { padding: 0, overflow: 'hidden' } }}>
        <Table
          size="small"
          rowKey={(t) => t.portfolio ?? ''}
          dataSource={totals}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Portfolio',
              dataIndex: 'portfolio',
              render: (v) => <Link to={rows({ portfolio: v ?? 'null' })}>{v ?? 'Not in a portfolio'}</Link>,
            },
            { title: 'Outstanding Receivables', dataIndex: 'outstanding_receivables', ...right, render: money },
            { title: 'Active Leases', dataIndex: 'active_leases', ...right, render: count },
            { title: 'Leases', dataIndex: 'total_leases', ...right, render: count },
            { title: 'Contracts', dataIndex: 'total_contracts', ...right, render: count },
            { title: 'Past Due', dataIndex: 'past_due', ...right, render: money },
            { title: 'Delinquent Leases', dataIndex: 'delinquent_leases', ...right, render: count },
            { title: 'Delinquency Rate', key: 'delinquency_rate', ...right, render: (_, t) => rate(t) },
          ]}
        />
      </Card>
    </div>
  )
}

const cardCol = { xs: 24, sm: 12, lg: 6 }

// Figure: one of the snapshot's totals, with how it was computed. It filters the contract table
// below to the rows it counts, where the totals row adds them up again.
function Figure({ to, title, value, formula }) {
  return (
    <LinkCard to={to}>
      <Statistic title={title} value={value} />
      <Typography.Text type="secondary">{formula}</Typography.Text>
    </LinkCard>
  )
}

// SnapshotDetail is /portfolio/snapshots/:id: a snapshot, its totals and the contract rows they
// are the sums of. The counts are of leases (a lease's main and deficiency contracts are one
// lease); the table says how many leases the contracts it lists belong to. The cards and the dashboard's trend charts link here with the filter that
// selects the rows a figure counts (?is_open=true), spelled as the API's own parameters.
export default function SnapshotDetail() {
  const { id } = useParams()
  const { record: s, error } = useRecord(`/api/snapshots/${encodeURIComponent(id)}`)
  const portfolios = usePortfolios()

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to="/portfolio/snapshots">Snapshots</Link> }, { title: s ? title(s) : id }]}
    />
  )
  if (s === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load snapshot ${id}: ${error}`} /></>
  if (s === null) return <>{crumbs}<Result status="404" title={`Snapshot ${id} not found`} /></>

  const rows = (params) => `${snapshotPath(s.id)}?${new URLSearchParams(params)}`
  const open = { is_open: 'true' }
  const active = `${count(s.active_contracts)} open contracts`

  return (
    <>
      {crumbs}
      <PageHeader title={title(s)} subtitle={`Portfolio as of ${s.as_of} · taken ${dateTime(s.taken_at)}`} extra={kindTag(s.kind)} />
      <Flex vertical gap="large">
        <Row gutter={[16, 16]}>
          <Col {...cardCol}>
            <Figure
              to={rows({ ...open, sort: '-outstanding_receivables' })}
              title="Outstanding receivables"
              value={money(s.outstanding_receivables)}
              formula={`Sum of Outstanding over the ${active}`}
            />
          </Col>
          <Col {...cardCol}>
            <Figure
              to={rows(open)}
              title="Active leases"
              value={count(s.active_leases)}
              formula={`Leases with an open contract, of ${count(s.total_leases)}; the ${active} belong to them`}
            />
          </Col>
          <Col {...cardCol}>
            <Figure
              to={rows({ ...open, sort: '-past_due' })}
              title="Past due"
              value={money(s.past_due)}
              formula={`Sum of Past Due over the ${active}`}
            />
          </Col>
          <Col {...cardCol}>
            <Figure
              to={rows({ ...open, 'days_delinquent.gt': '0', sort: '-days_delinquent' })}
              title="Delinquency rate"
              value={rate(s)}
              formula={`${count(s.delinquent_leases)} of the ${count(s.active_leases)} active leases have an open contract with Days Del above 0`}
            />
          </Col>
        </Row>
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'As of', children: s.as_of },
              { label: 'Servicer', children: s.servicer },
              {
                label: 'Source File',
                children: s.source_file ? (
                  <Link to={`/loads/files?source_file=${encodeURIComponent(s.source_file)}`}>{s.source_file}</Link>
                ) : (
                  'Contracts as loaded when taken'
                ),
              },
              { label: 'Taken', children: dateTime(s.taken_at) },
              { label: 'By', children: s.taken_by },
              ...(s.note ? [{ label: 'Note', span: 'filled', children: s.note }] : []),
            ]}
          />
        </Card>
        <ByPortfolio id={s.id} rows={rows} />
        <div>
          <Typography.Title level={5}>Contracts in this snapshot</Typography.Title>
          <Typography.Paragraph type="secondary">
            The rows the figures above were computed from, as they were when the snapshot was taken. The last row
            totals every row the filters match.
          </Typography.Paragraph>
          <DataTable
            endpoint="/api/snapshots/contracts"
            rowKey={contractKey}
            columns={columns(portfolios)}
            noun="contracts"
            baseFilters={{ snapshot_id: s.id }}
            sums={['outstanding_receivables', 'past_due']}
            distinct={{ column: 'lease_id', noun: 'leases' }}
            urlState
          />
        </div>
      </Flex>
    </>
  )
}
