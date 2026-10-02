import { useEffect, useState } from 'react'
import { Dashboard, Filters } from './types'
import { Columns } from './charts/Columns'
import { HBars } from './charts/HBars'
import { StatusStrip } from './charts/StatusStrip'
import { Panel } from './Panel'
import { money, moneyFull, int, pct, monthLabel, quarterLabel, axisMoney } from './format'

const ORDINAL = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)', 'var(--ord-5)']

/** The pre-2018 tail is a handful of leases — fold it so the chart keeps its room. */
function foldOldYears(years: { year: number; count: number; pv: number }[]) {
  const old = years.filter((y) => y.year <= 2017)
  const recent = years.filter((y) => y.year > 2017).map((y) => ({ label: String(y.year), count: y.count, pv: y.pv }))
  if (old.length === 0) return recent
  return [
    { label: '≤ 2017', count: old.reduce((a, y) => a + y.count, 0), pv: old.reduce((a, y) => a + y.pv, 0) },
    ...recent,
  ]
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-note">{note}</div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>({ obligor: '', condition: '', eligible: '' })

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.obligor) params.set('obligor', filters.obligor)
    if (filters.condition) params.set('condition', filters.condition)
    if (filters.eligible) params.set('eligible', filters.eligible)
    setLoading(true)
    fetch(`/api/dashboard?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`)
        return r.json()
      })
      .then((d: Dashboard) => {
        setData(d)
        setError('')
      })
      .catch(() => setError('The pool data is unavailable. Start the API with: go run ./dashboard/api'))
      .finally(() => setLoading(false))
  }, [filters])

  if (!data) {
    return (
      <div className="app">
        <h1 className="deal-name">Camber Credit 2026-1</h1>
        <p className="deal-sub">{error || 'Loading pool data…'}</p>
      </div>
    )
  }

  const s = data.summary
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1 className="deal-name">Camber Credit 2026-1</h1>
          <p className="deal-sub">Auto-lease pool servicing report for the August 31, 2026 cutoff</p>
          <div className="hero-value">{money(s.pvEligible)}</div>
          <div className="hero-label">Eligible collateral par value at the 9% discount rate</div>
          <div className="hero-context">
            {pct(s.pvTotal ? s.pvEligible / s.pvTotal : 0)} of the {money(s.pvTotal)} pool par value (
            {moneyFull(s.pvEligible)} exact)
          </div>
        </div>
        <div className="kpis">
          <Tile label="Active leases" value={int(s.active)} note={`of ${int(s.totalLeases)} in the pool`} />
          <Tile label="Delinquent 30+ days" value={int(s.delinquent30)} note={`${pct(s.active ? s.delinquent30 / s.active : 0)} of active`} />
          <Tile label="August collections" value={money(s.collections)} note="excludes property and sales tax" />
          <Tile label="Sales proceeds to date" value={money(s.proceeds)} note={`${int(s.sold)} vehicles sold`} />
        </div>
      </header>

      <section className="strip-section" aria-label="Pool composition">
        <h2 className="strip-title">Pool by lease status</h2>
        <div className={loading ? 'panel loading' : undefined} style={{ border: 0, padding: 0, background: 'none' }}>
          <StatusStrip status={data.status} />
        </div>
      </section>

      <div className="filters" role="group" aria-label="Pool filters">
        <label>
          Obligor
          <select value={filters.obligor} onChange={(e) => setFilters({ ...filters, obligor: e.target.value as Filters['obligor'] })}>
            <option value="">All</option>
            <option value="P">Personal</option>
            <option value="B">Business</option>
          </select>
        </label>
        <label>
          Condition at inception
          <select value={filters.condition} onChange={(e) => setFilters({ ...filters, condition: e.target.value as Filters['condition'] })}>
            <option value="">All</option>
            <option value="N">New</option>
            <option value="U">Used</option>
          </select>
        </label>
        <label>
          Collateral
          <select value={filters.eligible} onChange={(e) => setFilters({ ...filters, eligible: e.target.value as Filters['eligible'] })}>
            <option value="">All</option>
            <option value="1">Eligible only</option>
          </select>
        </label>
      </div>

      <div className="grid">
        <Panel
          title="Vehicle sales by month"
          sub="Net sales proceeds from terminated leases"
          loading={loading}
          table={{
            cols: [{ name: 'Month' }, { name: 'Vehicles sold', numeric: true }, { name: 'Net proceeds', numeric: true }],
            rows: data.terminationsByMonth.map((m) => [monthLabel(m.month), int(m.count), moneyFull(m.proceeds)]),
          }}
        >
          <Columns
            items={data.terminationsByMonth.map((m) => ({
              label: monthLabel(m.month),
              value: m.proceeds,
              tipTitle: monthLabel(m.month),
              tipRows: [
                { k: 'net proceeds', v: money(m.proceeds) },
                { k: 'vehicles sold', v: int(m.count) },
              ],
            }))}
            formatTick={axisMoney}
            directLabel={money}
          />
        </Panel>

        <Panel
          title="Termination outcomes"
          sub="Terminated leases by reason, with net sales proceeds"
          loading={loading}
          table={{
            cols: [{ name: 'Outcome' }, { name: 'Leases', numeric: true }, { name: 'Net proceeds', numeric: true }],
            rows: data.terminationsByType.map((t) => [t.type, int(t.count), moneyFull(t.proceeds)]),
          }}
        >
          <HBars
            items={data.terminationsByType.map((t) => ({
              label: t.type,
              value: t.count,
              note: `leases, ${money(t.proceeds)} proceeds`,
            }))}
          />
        </Panel>

        <Panel
          title="Delinquency of active leases"
          sub={`Past-due leases by days delinquent at the cutoff; ${int(
            data.delinquency.find((b) => b.bucket === 'Current')?.count ?? 0,
          )} leases are current`}
          loading={loading}
          table={{
            cols: [{ name: 'Days past due' }, { name: 'Leases', numeric: true }, { name: 'Par value', numeric: true }],
            rows: data.delinquency.map((b) => [b.bucket, int(b.count), moneyFull(b.pv)]),
          }}
        >
          <Columns
            items={data.delinquency
              .filter((b) => b.bucket !== 'Current')
              .map((b, i) => ({
                label: b.bucket,
                value: b.count,
                color: ORDINAL[(i + 1) % ORDINAL.length],
                tipTitle: `${b.bucket} past due`,
                tipRows: [
                  { k: 'leases', v: int(b.count) },
                  { k: 'par value', v: money(b.pv) },
                ],
              }))}
            formatTick={(v) => int(v)}
            directLabel={int}
          />
        </Panel>

        <Panel
          title="Maturity runoff"
          sub="Par value of active leases by scheduled maturity quarter"
          loading={loading}
          table={{
            cols: [{ name: 'Maturity quarter' }, { name: 'Leases', numeric: true }, { name: 'Par value', numeric: true }],
            rows: data.runoff.map((q) => [q.quarter, int(q.count), moneyFull(q.pv)]),
          }}
        >
          <Columns
            items={data.runoff.map((q) => ({
              label: quarterLabel(q.quarter),
              value: q.pv,
              tipTitle: q.quarter,
              tipRows: [
                { k: 'par value', v: money(q.pv) },
                { k: 'leases', v: int(q.count) },
              ],
            }))}
            formatTick={axisMoney}
            directLabel={money}
          />
        </Panel>

        <Panel
          title="Model-year mix"
          sub="Active leases by vehicle model year"
          loading={loading}
          table={{
            cols: [{ name: 'Model year' }, { name: 'Leases', numeric: true }, { name: 'Par value', numeric: true }],
            rows: data.modelYears.map((y) => [y.year, int(y.count), moneyFull(y.pv)]),
          }}
        >
          <Columns
            items={foldOldYears(data.modelYears).map((y) => ({
              label: y.label,
              value: y.count,
              tipTitle: y.label === '≤ 2017' ? 'Model years 2017 and older' : `Model year ${y.label}`,
              tipRows: [
                { k: 'leases', v: int(y.count) },
                { k: 'par value', v: money(y.pv) },
              ],
            }))}
            formatTick={(v) => int(v)}
            directLabel={int}
          />
        </Panel>
      </div>

      <p className="footer-note">
        Par values are the present value of remaining lease cash flows at a 9% discount rate, as of August 31, 2026.
        Source: camber_credit schema, lease tape distributed August 2026.
      </p>
    </div>
  )
}
