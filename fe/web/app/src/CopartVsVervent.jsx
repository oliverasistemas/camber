import { useEffect, useState } from 'react'
import { Alert, Col, Flex, Row, Statistic, Tag, Typography } from 'antd'
import DataTable, { money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import { assetLink, contractLink, vinLink } from './records.jsx'

// comparison values from the copart_vs_vervent view, in display order.
const outcomes = [
  { key: 'match', label: 'Match', color: 'green' },
  { key: 'differs', label: 'Differs', color: 'red' },
  { key: 'no vervent proceeds', label: 'No Vervent proceeds', color: 'orange' },
  { key: 'not in vervent', label: 'Not in Vervent', color: 'default' },
]
const byKey = Object.fromEntries(outcomes.map((o) => [o.key, o]))

const signedMoney = (v) =>
  v == null ? '' : <Typography.Text type={Math.abs(v) < 0.01 ? undefined : 'danger'}>{money(v)}</Typography.Text>

const columns = [
  { title: 'Lot', dataIndex: 'lot_nbr', fixed: 'left' },
  {
    title: 'Comparison',
    dataIndex: 'comparison',
    filters: outcomes.map((o) => ({ text: o.label, value: o.key })),
    render: (v) => <Tag color={byKey[v]?.color}>{byKey[v]?.label ?? v}</Tag>,
  },
  { title: 'VIN', dataIndex: 'vin', render: vinLink },
  { title: 'Vehicle', dataIndex: 'model', render: (_, r) => [r.year, r.make, r.model].filter(Boolean).join(' ') },
  { title: 'Copart Sold', dataIndex: 'sale_date' },
  { title: 'Copart Status', dataIndex: 'sales_status' },
  { title: 'Copart Net', dataIndex: 'net_sale_proceeds', align: 'right', render: money },
  { title: 'Vervent Proceeds', dataIndex: 'vervent_sale_proceeds', align: 'right', render: money },
  { title: 'Difference', dataIndex: 'difference', align: 'right', render: signedMoney },
  { title: 'Asset', dataIndex: 'asset_no', render: (v) => assetLink(v) },
  { title: 'Lease', dataIndex: 'lease', render: contractLink },
  { title: 'Vervent Sold', dataIndex: 'vervent_sold_date' },
  { title: 'Asset Status', dataIndex: 'asset_status' },
]

// CopartVsVervent is /copart/vs-vervent: every Copart sale against the Vervent asset with the
// same VIN, comparing Copart net proceeds with Vervent SALE PROCEEDS. Each outcome card filters
// the table below to its sales.
export default function CopartVsVervent() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/copart/vs-vervent/summary')
      .then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [])

  const groups = Object.fromEntries((summary ?? []).map((g) => [g.comparison, g]))

  return (
    <Flex vertical gap="large">
      {error && <Alert type="error" showIcon message={`Failed to load the summary: ${error}`} />}
      <Row gutter={[16, 16]}>
        {outcomes.map((o) => {
          const g = groups[o.key]
          return (
            <Col key={o.key} xs={24} sm={12} lg={6}>
              <LinkCard to={`?${new URLSearchParams({ comparison: o.key })}`} loading={!summary && !error}>
                <Statistic title={o.label} value={g?.sales ?? 0} suffix="sales" />
                <Typography.Text type="secondary">
                  {o.key === 'differs' && g
                    ? `Copart ${money(g.copart_net)} vs Vervent ${money(g.vervent_net)}, net ${money(g.difference)}`
                    : g
                      ? `Copart net ${money(g.copart_net)}`
                      : ' '}
                </Typography.Text>
              </LinkCard>
            </Col>
          )
        })}
      </Row>
      <DataTable endpoint="/api/copart/vs-vervent" rowKey="lot_nbr" columns={columns} noun="sales" urlState />
    </Flex>
  )
}
