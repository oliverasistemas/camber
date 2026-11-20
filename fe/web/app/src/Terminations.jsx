import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Col, Flex, Row, Statistic, Tag, Typography } from 'antd'
import DataTable, { compact, compactMoney, money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import { terminationLink, vinLink } from './records.jsx'
import { inPortfolio, portfolioColumn, usePortfolios } from './portfolios.jsx'

// stage values from the lease_terminations view, in display order.
export const stages = [
  { key: 'on lease', label: 'On lease', color: 'green' },
  { key: 'returned', label: 'Returned, not sold', color: 'orange' },
  { key: 'sold', label: 'Sold', color: 'default' },
]
const stageByKey = Object.fromEntries(stages.map((s) => [s.key, s]))
export const stageTag = (v) => v && <Tag color={stageByKey[v]?.color}>{stageByKey[v]?.label ?? v}</Tag>

export const miles = (v) => v?.toLocaleString('en-US')
export const signedMoney = (v) =>
  v == null ? '' : <Typography.Text type={v < 0 ? 'danger' : undefined}>{money(v)}</Typography.Text>

// The summary's groups (terminationGroups in be/rest/servicing.go) as cards. filters is the list
// filter that selects the rows a group counts; the two maturity groups use the dates the summary
// was computed with, so the list total equals the card.
const cards = [
  { key: 'on lease', label: 'On lease', filters: () => ({ stage: 'on lease' }) },
  {
    key: 'maturing',
    label: 'Maturing within 180 days',
    filters: (s) => ({ stage: 'on lease', 'maturity_date.gte': s.as_of, 'maturity_date.lte': s.maturing_by }),
  },
  { key: 'past maturity', label: 'On lease past maturity', filters: (s) => ({ stage: 'on lease', 'maturity_date.lt': s.as_of }) },
  { key: 'returned', label: 'Returned, not sold', filters: () => ({ stage: 'returned' }) },
  { key: 'sold', label: 'Sold', filters: () => ({ stage: 'sold' }) },
]

const columns = (portfolios) => [
  { title: 'Lease No', dataIndex: 'lease_no', fixed: 'left', render: terminationLink },
  {
    title: 'Stage',
    dataIndex: 'stage',
    filters: stages.map((s) => ({ text: s.label, value: s.key })),
    render: stageTag,
  },
  portfolioColumn(portfolios),
  { title: 'Vehicle', dataIndex: 'vehicle' },
  { title: 'VIN', dataIndex: 'vin', render: vinLink },
  { title: 'Lessee', dataIndex: 'lessee_name' },
  { title: 'Maturity', dataIndex: 'maturity_date' },
  { title: 'Terminated', dataIndex: 'termination_date' },
  { title: 'Days vs Maturity', dataIndex: 'days_vs_maturity', align: 'right' },
  { title: 'Contract', dataIndex: 'ls_status' },
  { title: 'Asset', dataIndex: 'asset_status' },
  { title: 'Payment', dataIndex: 'payment', align: 'right', render: money },
  { title: 'Residual', dataIndex: 'residual', align: 'right', render: money },
  { title: 'Est Payoff', dataIndex: 'est_payoff', align: 'right', render: money },
  { title: 'Past Due', dataIndex: 'total_past_due', align: 'right', render: money },
  { title: 'Copart Status', dataIndex: 'copart_status' },
  { title: 'Days in Yard', dataIndex: 'days_in_yard', align: 'right' },
  { title: 'Odometer', dataIndex: 'odometer', align: 'right', render: miles },
  { title: 'Excess Miles', dataIndex: 'excess_miles', align: 'right', render: miles },
  { title: 'Excess Mileage Fee', dataIndex: 'excess_mileage_fee', align: 'right', render: money },
  { title: 'Sold', dataIndex: 'sale_date' },
  { title: 'Channel', dataIndex: 'sale_channel', filters: ['Copart', 'Other'].map((v) => ({ text: v, value: v })) },
  { title: 'Net Proceeds', dataIndex: 'net_sale_proceeds', align: 'right', render: money },
  { title: 'Gain/(Loss) vs Residual', dataIndex: 'gain_loss', align: 'right', render: signedMoney },
]

// Terminations is /servicing/terminations: every vehicle lease from the lease_terminations view, the
// loaded part of the Master Servicing lease termination tracker. Each card filters the table below
// to the leases it counts; each row opens the lease's tracker page. The cards count Camber's
// leases, or those of the portfolio the table is filtered to.
export default function Terminations() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const portfolios = usePortfolios()
  const [params] = useSearchParams()
  const picked = params.get('camber_portfolio')
  const portfolio = picked && picked !== 'null' ? picked : ''

  useEffect(() => {
    let cancelled = false
    fetch(`/api/servicing/terminations/summary?${new URLSearchParams(portfolio ? { portfolio } : {})}`)
      .then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((s) => !cancelled && setSummary(s))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [portfolio])

  const groups = Object.fromEntries((summary?.groups ?? []).map((g) => [g.key, g]))

  return (
    <Flex vertical gap="large">
      {error && <Alert type="error" showIcon message={`Failed to load the summary: ${error}`} />}
      <Row gutter={[16, 16]}>
        {cards.map((c) => {
          const g = groups[c.key]
          return (
            <Col key={c.key} xs={24} sm={12} lg={{ flex: '20%' }}>
              <LinkCard
                to={summary ? `?${new URLSearchParams({ ...c.filters(summary), ...inPortfolio(portfolio) })}` : ''}
                loading={!summary && !error}
              >
                <Statistic title={c.label} value={compact(g?.units ?? 0)} suffix="leases" />
                <Typography.Text type="secondary">
                  {!g
                    ? ' '
                    : c.key === 'sold'
                      ? `Net proceeds ${compactMoney(g.net_sale_proceeds)}, ${compactMoney(g.gain_loss)} vs residual`
                      : `Residual ${compactMoney(g.residual)}`}
                </Typography.Text>
              </LinkCard>
            </Col>
          )
        })}
      </Row>
      <DataTable endpoint="/api/servicing/terminations" rowKey="lease_no" columns={columns(portfolios)} noun="leases" urlState />
    </Flex>
  )
}
