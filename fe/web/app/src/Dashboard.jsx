import { useEffect, useState } from 'react'
import { Alert, Card, Col, Row, Spin, Statistic, Tooltip, Typography } from 'antd'
import { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'

const SERIES = '#2a78d6' // single-series bars: categorical slot 1

// toView reshapes /api/vervent/metrics for the tiles and charts.
const toView = (m) => ({
  ...m,
  delinquency: m.delinquency_buckets.map((b) => ({ label: b.bucket, value: b.contracts })),
  assetStatus: m.asset_status.map((s) => ({ code: s.status, label: s.label, value: s.assets })),
})

// ColumnChart: one series of vertical bars, rounded data-ends on the baseline, hover tooltip per bar.
function ColumnChart({ data, unit }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, borderBottom: '1px solid #d9d9d9' }}>
      {data.map((d) => (
        <Tooltip key={d.label} title={`${d.label} days: ${d.value} ${unit}`}>
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {d.value || ''}
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
          </div>
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
function BarList({ data, total }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d) => (
        <Tooltip key={d.code} title={`${d.label} (${d.code}): ${d.value} of ${total} assets`} placement="topLeft">
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 8 }}>
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
              {d.value}
            </Typography.Text>
          </div>
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
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Active contracts"
              value={data.active_contracts}
              suffix={<Typography.Text type="secondary">/ {data.total_contracts}</Typography.Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="Outstanding receivables (active)" value={money(data.outstanding_receivables)} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Delinquency rate"
              value={data.delinquency_rate}
              precision={1}
              suffix="%"
            />
            <Typography.Text type="secondary">
              {data.delinquent_contracts} contracts · {money(data.past_due)} past due
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="Collections, last 30 days" value={money(data.collections_30d)} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }} title="Delinquent active contracts by days past due">
            <ColumnChart data={data.delinquency} unit="contracts" />
            <ColumnAxis data={data.delinquency} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }} title="Assets by status">
            <BarList data={data.assetStatus} total={data.total_assets} />
          </Card>
        </Col>
      </Row>
    </>
  )
}
