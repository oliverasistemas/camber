import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Row, Skeleton, Statistic, Tooltip, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { compactMoney, money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import PageHeader from './PageHeader.jsx'

// Days-past-due buckets are ordered, so they take one hue that darkens with age.
const AGING = ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#1c5cab', '#104281', '#0d366b']
// Asset statuses are categories: each keeps its own colour whichever statuses are present.
// Sold assets have left the portfolio, so they recede in grey behind the live statuses.
const STATUS_COLORS = { NLSE: '#2a78d6', ULSE: '#eb6834', URIN: '#1baf7a', NRIV: '#eda100', USLD: '#898781' }
const OTHER_STATUS = '#c3c2b7'

// Counts are shown exactly; only dollar headlines are abbreviated (compactMoney).
const count = (v) => Number(v).toLocaleString('en-US')
const share = (v, total) => {
  if (!total) return ''
  const pct = (v / total) * 100
  return pct > 0 && pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`
}
// day formats a YYYY-MM-DD date (Nov 11), shifted by offset days; '' if it is not a date.
const day = (iso, offset = 0, options) => {
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d)) return ''
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...options })
}

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

// ColumnChart: vertical bars with the value on each cap (0 included), hover tooltip per bar.
// Each bar links to its rows.
function ColumnChart({ data, unit, axisTitle }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, borderBottom: '1px solid #d9d9d9' }}>
        {data.map((d, i) => (
          <Tooltip key={d.label} title={`${d.label} ${axisTitle.toLowerCase()}: ${count(d.value)} ${unit}`}>
            <Link
              to={d.to}
              className="chart-link"
              style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {count(d.value)}
              </Typography.Text>
              <div
                className="chart-mark"
                style={{
                  width: '60%',
                  maxWidth: 56,
                  height: `${(d.value / max) * 160}px`,
                  background: AGING[Math.min(i, AGING.length - 1)],
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </Link>
          </Tooltip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {data.map((d) => (
          <Typography.Text key={d.label} type="secondary" style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
            {d.label}
          </Typography.Text>
        ))}
      </div>
      <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, marginTop: 4 }}>
        {axisTitle}
      </Typography.Text>
    </>
  )
}

// Only the figures: Inter's tabular setting also widens the hyphen in a label like Re-leased.
const tabular = { fontVariantNumeric: 'tabular-nums' }

// StackedBar: one bar split by category, with a legend giving each category's count and share of
// the total. Segments and legend rows link to their rows; a sliver keeps a clickable minimum width.
function StackedBar({ data, total, unit }) {
  const color = (d) => STATUS_COLORS[d.code] ?? OTHER_STATUS
  return (
    <>
      <div style={{ display: 'flex', gap: 2, height: 20 }}>
        {data.map((d, i) => (
          <Tooltip key={d.code} title={`${d.label} (${d.code}): ${count(d.value)} of ${count(total)} ${unit}`}>
            <Link to={d.to} className="chart-link" style={{ flex: `${d.value} 1 0%`, minWidth: 6 }}>
              <div
                className="chart-mark"
                style={{
                  height: '100%',
                  background: color(d),
                  borderRadius: i === data.length - 1 ? '0 4px 4px 0' : 0,
                }}
              />
            </Link>
          </Tooltip>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
        {data.map((d) => (
          <Link
            key={d.code}
            to={d.to}
            className="chart-link"
            style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto 56px', alignItems: 'center', gap: 8, padding: '6px 0' }}
          >
            <span className="chart-mark" style={{ width: 10, height: 10, borderRadius: 2, background: color(d) }} />
            <Typography.Text className="chart-label">{d.label}</Typography.Text>
            <Typography.Text style={tabular}>{count(d.value)}</Typography.Text>
            <Typography.Text type="secondary" style={{ ...tabular, textAlign: 'right' }}>
              {share(d.value, total)}
            </Typography.Text>
          </Link>
        ))}
      </div>
    </>
  )
}

// Tile: a headline figure with one line of context; exact is the unabbreviated value, on hover.
function Tile({ to, title, value, exact, note }) {
  const figure = <Statistic title={title} value={value} />
  return (
    <LinkCard to={to}>
      {exact ? <Tooltip title={exact}>{figure}</Tooltip> : figure}
      <Typography.Text type="secondary">{note}</Typography.Text>
    </LinkCard>
  )
}

const tileCol = { xs: 24, sm: 12, lg: 6 }
const chartCol = { xs: 24, lg: 12 }

// Loading: placeholders in the shape of the tiles and charts, so the page does not jump.
function Loading() {
  return (
    <Row gutter={[16, 16]}>
      {[0, 1, 2, 3].map((i) => (
        <Col key={i} {...tileCol}>
          <Card>
            <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 2 }} />
          </Card>
        </Col>
      ))}
      {[0, 1].map((i) => (
        <Col key={i} {...chartCol}>
          <Card>
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        </Col>
      ))}
    </Row>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/vervent/metrics')
      .then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((m) => setData(toView(m)))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Alert
          type="error"
          message={`Couldn't load the dashboard: ${error}`}
          action={
            <Button size="small" onClick={load}>
              Try again
            </Button>
          }
        />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Vervent portfolio 50" />
        <Loading />
      </>
    )
  }

  const asOf = day(data.as_of, 0, { year: 'numeric' })
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Vervent portfolio 50${asOf && `, data as of ${asOf}`}`} />
      <Row gutter={[16, 16]}>
        <Col {...tileCol}>
          <Tile
            to={links.active}
            title="Active contracts"
            value={count(data.active_contracts)}
            note={`${share(data.active_contracts, data.total_contracts)} of ${count(data.total_contracts)} contracts`}
          />
        </Col>
        <Col {...tileCol}>
          <Tile
            to={links.receivables}
            title="Outstanding receivables"
            value={compactMoney(data.outstanding_receivables)}
            exact={money(data.outstanding_receivables)}
            note={
              data.active_contracts > 0 &&
              `${compactMoney(data.outstanding_receivables / data.active_contracts)} average per active contract`
            }
          />
        </Col>
        <Col {...tileCol}>
          <Tile
            to={links.delinquent}
            title="Delinquency rate"
            value={`${data.delinquency_rate.toFixed(1)}%`}
            note={`${count(data.delinquent_contracts)} contracts, ${compactMoney(data.past_due)} past due`}
          />
        </Col>
        <Col {...tileCol}>
          <Tile
            to={links.collections(data.as_of)}
            title="Collections, last 30 days"
            value={compactMoney(data.collections_30d)}
            exact={money(data.collections_30d)}
            note={asOf && `Cash payments, ${day(data.as_of, -29)} to ${day(data.as_of)}`}
          />
        </Col>
        <Col {...chartCol}>
          <Card
            style={{ height: '100%' }}
            title="Delinquent active contracts by days past due"
            extra={<Link to={links.delinquent}>View all</Link>}
          >
            <ColumnChart data={data.delinquency} unit="contracts" axisTitle="Days past due" />
          </Card>
        </Col>
        <Col {...chartCol}>
          <Card style={{ height: '100%' }} title="Assets by status" extra={<Link to="/vervent/assets">View all</Link>}>
            <StackedBar data={data.assetStatus} total={data.total_assets} unit="assets" />
          </Card>
        </Col>
      </Row>
    </>
  )
}
