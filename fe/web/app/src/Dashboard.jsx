import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Row, Select, Skeleton, Statistic, Tooltip, Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { compactMoney, money } from './DataTable.jsx'
import LinkCard from './LinkCard.jsx'
import PageHeader from './PageHeader.jsx'
import TrendChart from './TrendChart.jsx'
import { inPortfolio, usePortfolios } from './portfolios.jsx'

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
// The figures count Camber's leases, or those of the portfolio picked in the header, so every
// link carries that condition too (inPortfolio).
const list = (path, params) => `${path}?${new URLSearchParams(params)}`
const linksFor = (portfolio) => {
  const owned = inPortfolio(portfolio)
  const active = { ...owned, is_account_open: 'true' }
  const delinquent = { ...active, 'days_del.gt': '0' }
  return {
    active: list('/vervent/contracts', active),
    receivables: list('/vervent/contracts', { ...active, sort: '-remaining_receivables' }),
    delinquent: list('/vervent/contracts', { ...delinquent, sort: '-days_del' }),
    bucket: (b) => list('/vervent/contracts', { ...delinquent, curr_delinq: b, sort: '-days_del' }),
    assets: list('/vervent/assets', owned),
    assetStatus: (code) => list('/vervent/assets', { ...owned, status: code }),
    // Cash transactions in the 30 days up to as_of, the latest transaction date.
    collections: (asOf) => {
      const since = new Date(`${asOf}T00:00:00Z`)
      if (isNaN(since)) return list('/vervent/transactions', owned)
      since.setUTCDate(since.getUTCDate() - 30)
      return list('/vervent/transactions', {
        ...owned,
        'transaction_date_key.gt': since.toISOString().slice(0, 10),
        'is_non_cash.ne': 'true',
        sort: '-payment_amount',
      })
    },
    // Cash transactions from the first of as_of's month.
    collectionsMonth: (asOf) =>
      list('/vervent/transactions', {
        ...owned,
        'transaction_date_key.gte': `${String(asOf).slice(0, 7)}-01`,
        'is_non_cash.ne': 'true',
        sort: '-payment_amount',
      }),
  }
}

// The trend charts plot the daily portfolio snapshots. A day links to its snapshot, filtered the
// way the snapshot's totals count its rows (portfolio/sql/01_portfolio_snapshots.sql), so the
// rows listed are the ones behind the day's figure and their total equals it. With a portfolio
// picked the days are the totals of that portfolio's rows, and the links select those rows.
const snapshot = (id, params) => list(`/portfolio/snapshots/${id}`, params)
const dayLinksFor = (portfolio) => {
  const openOnly = { ...(portfolio && { portfolio }), is_open: 'true' }
  return {
    receivables: (id) => snapshot(id, { ...openOnly, sort: '-outstanding_receivables' }),
    delinquent: (id) => snapshot(id, { ...openOnly, 'days_delinquent.gt': '0', sort: '-days_delinquent' }),
  }
}
const byDay = '/portfolio/snapshots?kind=daily'

// toTrends reshapes /api/snapshots/history into the two series.
const toTrends = (days, dayLinks) => ({
  receivables: days.map((d) => ({
    date: d.as_of,
    value: d.outstanding_receivables,
    note: `${count(d.active_contracts)} active contracts`,
    to: dayLinks.receivables(d.snapshot_id),
  })),
  delinquency: days.map((d) => ({
    date: d.as_of,
    value: d.delinquency_rate,
    note: `${count(d.delinquent_contracts)} of ${count(d.active_contracts)} active contracts`,
    to: dayLinks.delinquent(d.snapshot_id),
  })),
})

// change describes the move from the first to the last day of a series, e.g. "-$325.3K since Nov 10".
const change = (series, format) => {
  const delta = series[series.length - 1].value - series[0].value
  const sign = delta > 0 ? '+' : delta < 0 ? '\u2212' : ''
  return `${sign}${format(Math.abs(delta))} since ${day(series[0].date)}`
}

// TrendCard: a trend chart in a card, or a note while there are not yet two days to connect.
// The card links to the daily snapshots, the same figures as a table.
function TrendCard({ title, series, format, axis, delta }) {
  const enough = series.length >= 2
  return (
    <Card style={{ height: '100%' }} title={title} extra={<Link to={byDay}>View by day</Link>}>
      {enough ? (
        <>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            {change(series, delta)}
          </Typography.Text>
          <TrendChart data={series} format={format} axis={axis} label={title} />
        </>
      ) : (
        <Typography.Text type="secondary">The trend appears once two daily files have been loaded.</Typography.Text>
      )}
    </Card>
  )
}

// toView reshapes /api/vervent/metrics for the tiles and charts.
const toView = (m, links) => ({
  ...m,
  links,
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

// Five tiles: they share the row on a wide screen and wrap below that.
const tileCol = { flex: '1 1 220px' }
const chartCol = { xs: 24, lg: 12 }

// Loading: placeholders in the shape of the tiles and charts, so the page does not jump.
function Loading() {
  return (
    <Row gutter={[16, 16]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Col key={i} {...tileCol}>
          <Card>
            <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 2 }} />
          </Card>
        </Col>
      ))}
      {[0, 1, 2, 3].map((i) => (
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
  const portfolios = usePortfolios()
  // The portfolio picked lives in the query string (?portfolio=), so a filtered dashboard can be linked to.
  const [params, setParams] = useSearchParams()
  const portfolio = params.get('portfolio') ?? ''

  const load = useCallback(() => {
    setError(null)
    const query = `?${new URLSearchParams(portfolio ? { portfolio } : {})}`
    const get = (url) =>
      fetch(url).then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
    let cancelled = false
    Promise.all([get(`/api/vervent/metrics${query}`), get(`/api/snapshots/history${query}`)])
      .then(([m, days]) => !cancelled && setData({ ...toView(m, linksFor(portfolio)), trends: toTrends(days, dayLinksFor(portfolio)) }))
      .catch((err) => !cancelled && setError(err.message))
    // The figures of a portfolio picked since are on their way: drop these.
    return () => {
      cancelled = true
    }
  }, [portfolio])

  useEffect(load, [load])

  const picker = (
    <Select
      aria-label="Portfolio"
      value={portfolio}
      onChange={(v) => setParams(v ? { portfolio: v } : {})}
      options={[{ value: '', label: 'All portfolios' }, ...portfolios.map((p) => ({ value: p, label: p }))]}
      popupMatchSelectWidth={false}
      style={{ minWidth: 200 }}
    />
  )

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" extra={picker} />
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
        <PageHeader title="Dashboard" subtitle="Camber's leases at Vervent" extra={picker} />
        <Loading />
      </>
    )
  }

  const asOf = day(data.as_of, 0, { year: 'numeric' })
  const links = data.links
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Camber's leases at Vervent${asOf && `, data as of ${asOf}`}`} extra={picker} />
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
        <Col {...tileCol}>
          <Tile
            to={links.collectionsMonth(data.as_of)}
            title={`Collections, ${day(data.as_of, 0, { month: 'long', day: undefined }) || 'this month'} to date`}
            value={compactMoney(data.collections_mtd)}
            exact={money(data.collections_mtd)}
            note={asOf && `Cash payments, ${day(`${data.as_of.slice(0, 7)}-01`)} to ${day(data.as_of)}`}
          />
        </Col>
        <Col {...chartCol}>
          <TrendCard
            title="Outstanding receivables by day"
            series={data.trends.receivables}
            format={money}
            axis={compactMoney}
            delta={compactMoney}
          />
        </Col>
        <Col {...chartCol}>
          <TrendCard
            title="Delinquency rate by day"
            series={data.trends.delinquency}
            format={(v) => `${v.toFixed(2)}%`}
            axis={(v) => `${Number(v.toFixed(2))}%`}
            delta={(v) => `${v.toFixed(2)} pts`}
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
          <Card style={{ height: '100%' }} title="Assets by status" extra={<Link to={links.assets}>View all</Link>}>
            <StackedBar data={data.assetStatus} total={data.total_assets} unit="assets" />
          </Card>
        </Col>
      </Row>
    </>
  )
}
