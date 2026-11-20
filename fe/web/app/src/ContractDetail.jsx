import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { columns as assetColumns } from './Assets.jsx'
import { columns as transactionColumns } from './Transactions.jsx'
import { contractColumns as snapshotColumns, contractKey as snapshotKey } from './SnapshotDetail.jsx'
import { useRecord } from './records.jsx'
import { camberList } from './portfolios.jsx'

// The lease number and lessee are already in the page header, so drop them from the tables.
const assetCols = assetColumns.filter((c) => !['lease', 'name'].includes(c.dataIndex))
const transactionCols = transactionColumns.filter(
  (c) => !['contract_number', 'name'].includes(c.dataIndex),
)
// One row per daily portfolio snapshot the contract is in; the date opens its row in that snapshot.
const historyCols = snapshotColumns
  .filter((c) => !['contract_no', 'monthly_payment', 'residual', 'maturity_date'].includes(c.dataIndex))
  .map(({ filters, ...c }) => c)

// ContractDetail is /vervent/contracts/:leaseNo: the contract, its assets, its transactions and
// its day-by-day receivables and delinquency.
export default function ContractDetail() {
  const { leaseNo } = useParams()
  const { record: c, error } = useRecord(`/api/vervent/contracts/${encodeURIComponent(leaseNo)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to={camberList('/vervent/contracts')}>Contracts</Link> }, { title: leaseNo }]}
    />
  )
  if (c === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load lease ${leaseNo}: ${error}`} /></>
  if (c === null) return <>{crumbs}<Result status="404" title={`Lease ${leaseNo} not found`} /></>

  return (
    <>
      {crumbs}
      <PageHeader
        title={`Lease ${c.lease_no}`}
        subtitle={c.lessee_name}
        extra={<Tag color={c.account_status === 'Active' ? 'green' : 'default'}>{c.account_status}</Tag>}
      />
      <Flex vertical gap="large">
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Status', children: c.ls_status },
              { label: 'Type', children: c.ls_type },
              { label: 'Commenced', children: c.commence_date },
              { label: 'Maturity', children: c.maturity_date },
              { label: 'Term', children: `${c.term} mo` },
              { label: 'Orig Cost', children: money(c.orig_cost) },
              { label: 'Payment', children: money(c.curr_pymt) },
              { label: 'Remaining', children: money(c.remaining_receivables) },
              { label: 'Past Due', children: money(c.total_past_due) },
              { label: 'Days Del', children: c.days_del },
              { label: 'Est Payoff', children: money(c.est_payoff) },
              { label: 'Dealer', children: c.dlr_name },
              { label: 'Portfolio', children: c.camber_portfolio ?? 'Not in a portfolio' },
              {
                label: 'Camber Lease',
                children: c.camber_lease_id && (
                  <Link to={`/vervent/contracts?camber_lease_id=${encodeURIComponent(c.camber_lease_id)}`}>{c.camber_lease_id}</Link>
                ),
              },
            ]}
          />
        </Card>
        <div>
          <Typography.Title level={5}>Assets</Typography.Title>
          <DataTable
            endpoint="/api/vervent/assets"
            rowKey="asset_no"
            columns={assetCols}
            noun="assets"
            baseFilters={{ lease: c.lease_no }}
            pageSize={5}
          />
        </div>
        <div>
          <Typography.Title level={5}>Transactions</Typography.Title>
          <DataTable
            endpoint="/api/vervent/transactions"
            rowKey="transaction_key"
            columns={transactionCols}
            noun="transactions"
            baseFilters={{ contract_number: c.lease_no }}
            pageSize={10}
          />
        </div>
        <div>
          <Typography.Title level={5}>Daily history</Typography.Title>
          <DataTable
            endpoint="/api/snapshots/contracts"
            rowKey={snapshotKey}
            columns={historyCols}
            noun="days"
            baseFilters={{ contract_no: c.lease_no, kind: 'daily' }}
            pageSize={10}
          />
        </div>
      </Flex>
    </>
  )
}
