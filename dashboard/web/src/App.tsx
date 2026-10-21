import { useEffect, useState } from 'react'
import { Dashboard, Filters, Me } from './types'
import { Login } from './Login'
import { Leases } from './Leases'
import { LeaseView } from './LeaseView'
import { CollectionsView } from './CollectionsView'
import { Columns } from './charts/Columns'
import { HBars } from './charts/HBars'
import { StatusStrip } from './charts/StatusStrip'
import { Panel } from './Panel'
import { Logo } from './Logo'
import { money, moneyFull, int, pct, monthLabel, quarterLabel, axisMoney } from './format'

const ORDINAL = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)', 'var(--ord-5)']

/** Dashboard bucket labels → /api/leases bucket param. */
const BUCKET_PARAM: Record<string, string> = {
  Current: 'current',
  '1–30 days': '1-30',
  '31–60 days': '31-60',
  '61–90 days': '61-90',
  '90+ days': '90+',
}

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

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
  const [authed, setAuthed] = useState<boolean | null>(null) // null until /api/me answers
  const [me, setMe] = useState<Me | null>(null)
  const [filters, setFilters] = useState<Filters>({ obligor: '', condition: '', eligible: '' })
  const hash = useHash()
  const collectionsMatch = hash.match(/^#\/lease\/(\d+)\/collections/)
  const leaseMatch = collectionsMatch ? null : hash.match(/^#\/lease\/(\d+)/)
  const onLeaseList = hash.startsWith('#/leases')
  const onDashboard = !collectionsMatch && !leaseMatch && !onLeaseList

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [hash])

  // Who is signed in? A 401 (or an unreachable API) shows the login card.
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Me | null) => {
        setMe(m)
        setAuthed(m !== null)
      })
      .catch(() => setAuthed(false))
  }, [])

  useEffect(() => {
    if (!authed || !onDashboard) return
    const params = new URLSearchParams()
    if (filters.obligor) params.set('obligor', filters.obligor)
    if (filters.condition) params.set('condition', filters.condition)
    if (filters.eligible) params.set('eligible', filters.eligible)
    setLoading(true)
    fetch(`/api/dashboard?${params}`)
      .then((r) => {
        if (r.status === 401) {
          setAuthed(false)
          return null
        }
        if (!r.ok) throw new Error(`API returned ${r.status}`)
        return r.json()
      })
      .then((d: Dashboard | null) => {
        if (d) {
          setData(d)
          setError('')
        }
      })
      .catch(() => setError('The pool data is unavailable. Start the API with: go run ./dashboard/api'))
      .finally(() => setLoading(false))
  }, [filters, authed, onDashboard])

  /** Open the lease list for a chart slice, carrying the global filters. */
  function drill(extra: Record<string, string>) {
    const p = new URLSearchParams()
    if (filters.obligor) p.set('obligor', filters.obligor)
    if (filters.condition) p.set('condition', filters.condition)
    if (filters.eligible) p.set('eligible', filters.eligible)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    window.location.hash = `#/leases?${p}`
  }

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' })
    setData(null)
    setMe(null)
    setAuthed(false)
  }

  if (authed === null) {
    return null // checking the session; avoid flashing either screen
  }

  if (!authed) {
    return <Login />
  }

  if (collectionsMatch) {
    return <CollectionsView id={collectionsMatch[1]} onUnauthorized={() => setAuthed(false)} />
  }

  if (leaseMatch) {
    return <LeaseView id={leaseMatch[1]} onUnauthorized={() => setAuthed(false)} />
  }

  if (onLeaseList) {
    return <Leases query={hash.split('?')[1] ?? ''} onUnauthorized={() => setAuthed(false)} />
  }

  if (!data) {
    return (
      <div className="app">
        <div className="brand-row">
          <Logo />
          <h1 className="deal-name">Camber Credit 2026-1</h1>
        </div>
        <p className="deal-sub">{error || 'Loading pool data…'}</p>
      </div>
    )
  }

  const s = data.summary
  const pastDue = data.delinquency.filter((b) => b.bucket !== 'Current')
  const yearCols = foldOldYears(data.modelYears)
  const yearDrill = (label: string) =>
    label === '≤ 2017' ? drill({ status: '0', modelYearMax: '2017' }) : drill({ status: '0', modelYear: label })
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <div className="brand-row">
            <Logo />
            <h1 className="deal-name">Camber Credit 2026-1</h1>
          </div>
          <p className="deal-sub">
            Auto-lease pool servicing report for the August 31, 2026 cutoff
            <span className="signed-in">
              {me && <span className="signed-in-as">{me.email}</span>}
              <button className="sign-out" onClick={signOut}>
                Sign out
              </button>
            </span>
          </p>
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
          <StatusStrip status={data.status} onSelect={(code) => drill({ status: String(code) })} />
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
            onRow: (i) => drill({ soldMonth: data.terminationsByMonth[i].month }),
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
            onSelect={(i) => drill({ soldMonth: data.terminationsByMonth[i].month })}
          />
        </Panel>

        <Panel
          title="Termination outcomes"
          sub="Terminated leases by reason, with net sales proceeds"
          loading={loading}
          table={{
            cols: [{ name: 'Outcome' }, { name: 'Leases', numeric: true }, { name: 'Net proceeds', numeric: true }],
            rows: data.terminationsByType.map((t) => [t.type, int(t.count), moneyFull(t.proceeds)]),
            onRow: (i) => drill({ termination: data.terminationsByType[i].type }),
          }}
        >
          <HBars
            items={data.terminationsByType.map((t) => ({
              label: t.type,
              value: t.count,
              note: `leases, ${money(t.proceeds)} proceeds`,
            }))}
            onSelect={(i) => drill({ termination: data.terminationsByType[i].type })}
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
            onRow: (i) => drill({ status: '0', bucket: BUCKET_PARAM[data.delinquency[i].bucket] }),
          }}
        >
          <Columns
            items={pastDue.map((b, i) => ({
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
            onSelect={(i) => drill({ status: '0', bucket: BUCKET_PARAM[pastDue[i].bucket] })}
          />
        </Panel>

        <Panel
          title="Maturity runoff"
          sub="Par value of active leases by scheduled maturity quarter"
          loading={loading}
          table={{
            cols: [{ name: 'Maturity quarter' }, { name: 'Leases', numeric: true }, { name: 'Par value', numeric: true }],
            rows: data.runoff.map((q) => [q.quarter, int(q.count), moneyFull(q.pv)]),
            onRow: (i) => drill({ status: '0', maturityQuarter: data.runoff[i].quarter }),
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
            onSelect={(i) => drill({ status: '0', maturityQuarter: data.runoff[i].quarter })}
          />
        </Panel>

        <Panel
          title="Model-year mix"
          sub="Active leases by vehicle model year"
          loading={loading}
          table={{
            cols: [{ name: 'Model year' }, { name: 'Leases', numeric: true }, { name: 'Par value', numeric: true }],
            rows: data.modelYears.map((y) => [y.year, int(y.count), moneyFull(y.pv)]),
            onRow: (i) => drill({ status: '0', modelYear: String(data.modelYears[i].year) }),
          }}
        >
          <Columns
            items={yearCols.map((y) => ({
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
            onSelect={(i) => yearDrill(yearCols[i].label)}
          />
        </Panel>
      </div>

      <p className="footer-note">
        Par values are the present value of remaining lease cash flows at a 9% discount rate, as of August 31, 2026.
        Source: camber_credit schema, lease tape distributed August 2026. Click any chart segment or table row to open
        the underlying leases.
      </p>
    </div>
  )
}
