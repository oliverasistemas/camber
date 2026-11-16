import { useEffect, useState } from 'react'
import { Alert, Card, Col, Row, Spin, Statistic, Tooltip, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { compact, compactMoney, money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import PageHeader from './PageHeader.jsx'

const SERIES = '#2a78d6' // single-series bars: categorical slot 1

// Every figure links to the list of rows it counts, filtered through the query string with the
// same conditions the metric uses (be/rest/pgstore.go handleMetrics); keep the two in step.
const list = (path, params) => `${path}?${new URLSearchParams(params)}`
const active = { is_account_open: 'true' }
const delinquent = { ...active, 'days_del.gt': '0' }
const links = {
  active: list('/vervent/contracts', active),
  receivables: list('/vervent/contracts', { ...active, sort: '-remaining_receivables' }),
  delinquent: list('/vervent/contracts', { ...delinquent, sort: '-days_del' }),
  bucket: (b) => list('/vervent/contracts', { ...delinquent, curr_delinq: b, sort: '-days_del' }),
  assetStatus: (code) => list('/vervent/assets', { status: code }),
  // Cash transactions in the 30 days up to as_of, the latest transaction date.
  collections: (asOf) => {
    const since = new Date(`${asOf}T00:00:00Z`)
    if (isNaN(since)) return '/vervent/transactions'
    since.setUTCDate(since.getUTCDate() - 30)
    return list('/vervent/transactions', {
      'transaction_date_key.gt': since.toISOString().slice(0, 10),
      'is_non_cash.ne': 'true',
      sort: '-payment_amount',
    })
  },
}

// toView reshapes /api/vervent/metrics for the tiles and charts.
const toView = (m) => ({
  ...m,
  delinquency: m.delinquency_buckets.map((b) => ({ label: b.bucket, value: b.contracts, to: links.bucket(b.bucket) })),
  assetStatus: m.asset_status.map((s) => ({ code: s.status, label: s.label, value: s.assets, to: links.assetStatus(s.status) })),
})

// ColumnChart: one series of vertical bars, rounded data-ends on the baseline, hover tooltip per bar.
// Each bar links to its rows.
function ColumnChart({ data, unit }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, borderBottom: '1px solid #d9d9d9' }}>
      {data.map((d) => (
        <Tooltip key={d.label} title={`${d.label} days: ${d.value} ${unit}`}>
          <Link to={d.to} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {d.value ? compact(d.value) : ''}
            </Typography.Text>
            <div
              style={{
                width: '60%',
                maxWidth: 32,
                height: `${(d.value / max) * 140}px`,
                background: SERIES,
                borderRadius: '4px 4px 0 0',
              }}
            />
          </Link>
        </Tooltip>
      ))}
    </div>
  )
}

function ColumnAxis({ data }) {
  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
      {data.map((d) => (
        <Typography.Text key={d.label} type="secondary" style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
          {d.label}
        </Typography.Text>
      ))}
    </div>
  )
}

// BarList: one series of horizontal bars with the label and value as text beside each bar.
// Each row links to its rows.
function BarList({ data, total }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d) => (
        <Tooltip key={d.code} title={`${d.label} (${d.code}): ${d.value} of ${total} assets`} placement="topLeft">
          <Link to={d.to} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 8 }}>
            <Typography.Text>{d.label}</Typography.Text>
            <div style={{ height: 12 }}>
              <div
                style={{
                  width: `${(d.value / max) * 100}%`,
                  height: '100%',
                  background: SERIES,
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>
            <Typography.Text type="secondary" style={{ textAlign: 'right' }}>
              {compact(d.value)}
            </Typography.Text>
          </Link>
        </Tooltip>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/vervent/metrics')
      .then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((m) => setData(toView(m)))
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <Alert type="error" message={`Failed to load dashboard: ${error}`} />
  if (!data) return <Spin size="large" style={{ display: 'block', margin: '64px auto' }} />

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Vervent portfolio 50 · data as of ${data.as_of}`} />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <LinkCard to={links.active}>
            <Statistic
              title="Active contracts"
              value={compact(data.active_contracts)}
              suffix={<Typography.Text type="secondary">/ {compact(data.total_contracts)}</Typography.Text>}
            />
          </LinkCard>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <LinkCard to={links.receivables}>
            <Tooltip title={money(data.outstanding_receivables)}>
              <Statistic title="Outstanding receivables (active)" value={compactMoney(data.outstanding_receivables)} />
            </Tooltip>
          </LinkCard>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <LinkCard to={links.delinquent}>
            <Statistic
              title="Delinquency rate"
              value={data.delinquency_rate}
              precision={1}
              suffix="%"
            />
            <Typography.Text type="secondary">
              {compact(data.delinquent_contracts)} contracts · {compactMoney(data.past_due)} past due
            </Typography.Text>
          </LinkCard>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <LinkCard to={links.collections(data.as_of)}>
            <Tooltip title={money(data.collections_30d)}>
              <Statistic title="Collections, last 30 days" value={compactMoney(data.collections_30d)} />
            </Tooltip>
          </LinkCard>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            style={{ height: '100%' }}
            title="Delinquent active contracts by days past due"
            extra={<Link to={links.delinquent}>View all</Link>}
          >
            <ColumnChart data={data.delinquency} unit="contracts" />
            <ColumnAxis data={data.delinquency} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }} title="Assets by status" extra={<Link to="/vervent/assets">View all</Link>}>
            <BarList data={data.assetStatus} total={data.total_assets} />
          </Card>
        </Col>
      </Row>
    </>
  )
}
