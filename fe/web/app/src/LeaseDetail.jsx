import { Alert, Breadcrumb, Col, Flex, Result, Row, Spin, Statistic, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import PageHeader from './PageHeader.jsx'
import { columns as contractColumns } from './Contracts.jsx'
import { columns as assetColumns } from './Assets.jsx'
import { columns as transactionColumns } from './Transactions.jsx'
import { useRecord } from './records.jsx'
import { camberList } from './portfolios.jsx'

// Every row here is of the one lease and portfolio, so the contract table drops those columns.
const contractCols = contractColumns([]).filter((c) => !['camber_lease_id', 'camber_portfolio'].includes(c.dataIndex))
const totals = ['remaining_receivables', 'total_past_due', 'est_payoff']

const cardCol = { xs: 24, sm: 12, lg: 6 }

// LeaseDetail is /vervent/leases/:leaseId: a lease under its Camber lease id, which its
// deficiency (and other follow-on) contracts share with the main contract. It shows the
// contracts, their balances added up, and the assets and transactions of all of them together.
// The cards link to the contract list filtered to the lease, whose rows they total.
export default function LeaseDetail() {
  const { leaseId } = useParams()
  const filter = { camber_lease_id: leaseId }
  const { record: lease, error } = useRecord(
    `/api/vervent/contracts?${new URLSearchParams({ ...filter, sum: totals.join(','), sort: 'lease_no', limit: 100 })}`,
  )

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to={camberList('/vervent/contracts')}>Contracts</Link> }, { title: `Lease ${leaseId}` }]}
    />
  )
  if (lease === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load lease ${leaseId}: ${error}`} /></>
  if (!lease?.total) return <>{crumbs}<Result status="404" title={`No contract belongs to lease ${leaseId}`} /></>

  const contracts = lease.data
  // The main contract carries the lease's own number; a follow-on contract can outlive it in the files.
  const main = contracts.find((c) => c.lease_no === leaseId)
  const followOn = lease.total - (main ? 1 : 0)
  const open = contracts.filter((c) => c.is_account_open).length
  const to = `/vervent/contracts?${new URLSearchParams(filter)}`

  return (
    <>
      {crumbs}
      <PageHeader
        title={`Lease ${leaseId}`}
        subtitle={(main ?? contracts[0]).lessee_name}
        extra={<Tag>{contracts[0].camber_portfolio ?? 'Not in a portfolio'}</Tag>}
      />
      <Flex vertical gap="large">
        <Row gutter={[16, 16]}>
          <Col {...cardCol}>
            <LinkCard to={to}>
              <Statistic title="Contracts" value={lease.total} />
              <Typography.Text type="secondary">
                {main ? 'The main contract' : 'No main contract'}
                {followOn > 0 && ` and ${followOn} follow-on`}, {open} open
              </Typography.Text>
            </LinkCard>
          </Col>
          <Col {...cardCol}>
            <LinkCard to={to}>
              <Statistic title="Remaining receivables" value={money(lease.sums.remaining_receivables)} />
              <Typography.Text type="secondary">Sum of Remaining over the contracts</Typography.Text>
            </LinkCard>
          </Col>
          <Col {...cardCol}>
            <LinkCard to={to}>
              <Statistic title="Past due" value={money(lease.sums.total_past_due)} />
              <Typography.Text type="secondary">Sum of Past Due over the contracts</Typography.Text>
            </LinkCard>
          </Col>
          <Col {...cardCol}>
            <LinkCard to={to}>
              <Statistic title="Estimated payoff" value={money(lease.sums.est_payoff)} />
              <Typography.Text type="secondary">Sum of Est Payoff over the contracts</Typography.Text>
            </LinkCard>
          </Col>
        </Row>
        <div>
          <Typography.Title level={5}>Contracts</Typography.Title>
          <DataTable
            endpoint="/api/vervent/contracts"
            rowKey="lease_no"
            columns={contractCols}
            noun="contracts"
            baseFilters={filter}
            defaultSort="lease_no"
            sums={['remaining_receivables']}
            pageSize={5}
          />
        </div>
        <div>
          <Typography.Title level={5}>Assets</Typography.Title>
          <DataTable endpoint="/api/vervent/assets" rowKey="asset_no" columns={assetColumns} noun="assets" baseFilters={filter} pageSize={5} />
        </div>
        <div>
          <Typography.Title level={5}>Transactions</Typography.Title>
          <DataTable
            endpoint="/api/vervent/transactions"
            rowKey="transaction_key"
            columns={transactionColumns}
            noun="transactions"
            baseFilters={filter}
            defaultSort="-transaction_date_key"
            pageSize={10}
          />
        </div>
      </Flex>
    </>
  )
}
