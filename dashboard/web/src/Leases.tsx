import { useEffect, useState } from 'react'
import { LeaseList } from './types'
import { int, money, moneyFull, dateLabel, monthFull, quarterLabel } from './format'
import { useMediaQuery } from './useWidth'

const STATUS_NAMES: Record<string, string> = { '0': 'Active', '1': 'In inventory', '2': 'Sold' }
const BUCKET_NAMES: Record<string, string> = {
  current: 'current',
  '1-30': '1–30 days past due',
  '31-60': '31–60 days past due',
  '61-90': '61–90 days past due',
  '90+': '90+ days past due',
}

/** Human description of the slice encoded in the query string. */
function describe(p: URLSearchParams): string {
  const parts: string[] = []
  const status = p.get('status')
  const bucket = p.get('bucket')
  if (status && STATUS_NAMES[status]) parts.push(`${STATUS_NAMES[status].toLowerCase()} leases`)
  else parts.push('leases')
  if (bucket && BUCKET_NAMES[bucket]) parts.push(BUCKET_NAMES[bucket])
  if (p.get('termination')) parts.push(`terminated by ${p.get('termination')!.toLowerCase()}`)
  if (p.get('soldMonth')) parts.push(`vehicle sold in ${monthFull(p.get('soldMonth')!)}`)
  if (p.get('maturityQuarter')) parts.push(`maturing in ${p.get('maturityQuarter')}`)
  if (p.get('modelYear')) parts.push(`model year ${p.get('modelYear')}`)
  if (p.get('modelYearMax')) parts.push(`model year ${p.get('modelYearMax')} or older`)
  if (p.get('obligor') === 'P') parts.push('personal obligors')
  if (p.get('obligor') === 'B') parts.push('business obligors')
  if (p.get('condition') === 'N') parts.push('new at inception')
  if (p.get('condition') === 'U') parts.push('used at inception')
  if (p.get('eligible') === '1') parts.push('eligible collateral only')
  const s = parts.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const COLS: { name: string; sort?: string; numeric?: boolean }[] = [
  { name: 'Lease', sort: 'id' },
  { name: 'Vehicle' },
  { name: 'Status' },
  { name: 'Days past due', sort: 'delinquent', numeric: true },
  { name: 'Maturity', sort: 'maturity' },
  { name: 'Monthly payment', sort: 'payment', numeric: true },
  { name: 'Par value', sort: 'pv', numeric: true },
]

export function Leases({ query, onUnauthorized }: { query: string; onUnauthorized: () => void }) {
  const [data, setData] = useState<LeaseList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const params = new URLSearchParams(query)
  const sort = params.get('sort') ?? 'pv'
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const offset = Math.max(0, Number(params.get('offset')) || 0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leases?${query}`)
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        if (!r.ok) throw new Error(`API returned ${r.status}`)
        return r.json()
      })
      .then((d: LeaseList | null) => {
        if (d) {
          setData(d)
          setError('')
        }
      })
      .catch(() => setError('The lease list is unavailable. Start the API with: go run ./dashboard/api'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function withParams(changes: Record<string, string | null>): string {
    const p = new URLSearchParams(query)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    return `#/leases?${p}`
  }

  function toggleSort(col: string) {
    const nextDir = sort === col && dir === 'desc' ? 'asc' : 'desc'
    window.location.hash = withParams({ sort: col, dir: nextDir, offset: null })
  }

  const limit = data?.limit ?? 50
  const total = data?.total ?? 0
  const narrow = useMediaQuery('(max-width: 680px)')

  return (
    <div className="app">
      <a className="crumb" href="#/">
        ← Pool dashboard
      </a>
      <h1 className="deal-name">Camber Credit 2026-1 — Leases</h1>
      <p className="deal-sub">
        {describe(params)}
        {data && (
          <>
            {' · '}
            <strong>{int(total)}</strong> leases, <strong>{money(data.pvTotal)}</strong> par value
          </>
        )}
      </p>

      {error && <p className="deal-sub">{error}</p>}

      {data && narrow && (
        <section className={loading ? 'panel loading' : 'panel'}>
          <div className="sort-row">
            <label>
              Sort by
              <select
                value={sort}
                onChange={(e) => (window.location.hash = withParams({ sort: e.target.value, offset: null }))}
              >
                {COLS.filter((c) => c.sort).map((c) => (
                  <option key={c.sort} value={c.sort}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="dir-btn"
              onClick={() => (window.location.hash = withParams({ dir: dir === 'desc' ? 'asc' : 'desc', offset: null }))}
            >
              {dir === 'desc' ? '↓ High to low' : '↑ Low to high'}
            </button>
          </div>
          <div className="lease-cards">
            {data.rows.map((r) => (
              <a key={r.leaseId} className="lease-card" href={`#/lease/${r.leaseId}`}>
                <span className="lc-top">
                  <span className="lc-id">{r.leaseId}</span>
                  <span className="lc-pv">{r.pv !== null ? moneyFull(r.pv) : '—'}</span>
                </span>
                <span className="lc-desc">{r.description}</span>
                <span className="lc-meta">
                  <span>{r.statusName}</span>
                  {r.daysDelinquent > 0 && <span className="lc-late">{int(r.daysDelinquent)} days past due</span>}
                  <span>Matures {dateLabel(r.maturityDate)}</span>
                  <span>{moneyFull(r.paymentRegular)}/mo</span>
                </span>
              </a>
            ))}
            {data.rows.length === 0 && <p className="lease-empty">No leases match this slice.</p>}
          </div>
          {total > limit && <Pager offset={offset} limit={limit} total={total} withParams={withParams} />}
        </section>
      )}

      {data && !narrow && (
        <section className={loading ? 'panel loading' : 'panel'}>
          <table className="viz-table lease-table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.name} className={c.numeric ? 'num' : undefined} aria-sort={c.sort === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort ? (
                      <button className="th-sort" onClick={() => toggleSort(c.sort!)}>
                        {c.name}
                        {c.sort === sort && <span aria-hidden="true"> {dir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    ) : (
                      c.name
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.leaseId}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => (window.location.hash = `#/lease/${r.leaseId}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') window.location.hash = `#/lease/${r.leaseId}`
                  }}
                >
                  <td>
                    <a href={`#/lease/${r.leaseId}`} onClick={(e) => e.stopPropagation()}>
                      {r.leaseId}
                    </a>
                  </td>
                  <td>{r.description}</td>
                  <td>{r.statusName}</td>
                  <td className="num">{r.daysDelinquent > 0 ? int(r.daysDelinquent) : '—'}</td>
                  <td>{dateLabel(r.maturityDate)}</td>
                  <td className="num">{moneyFull(r.paymentRegular)}</td>
                  <td className="num">{r.pv !== null ? moneyFull(r.pv) : '—'}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} style={{ color: 'var(--muted)' }}>
                    No leases match this slice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {total > limit && <Pager offset={offset} limit={limit} total={total} withParams={withParams} />}
        </section>
      )}

      <p className="footer-note">
        Par values are the present value of remaining lease cash flows at a 9% discount rate, as of August 31, 2026.
      </p>
    </div>
  )
}

function Pager({
  offset,
  limit,
  total,
  withParams,
}: {
  offset: number
  limit: number
  total: number
  withParams: (changes: Record<string, string | null>) => string
}) {
  return (
    <div className="pager">
      <span>
        {int(offset + 1)}–{int(Math.min(offset + limit, total))} of {int(total)}
      </span>
      <button disabled={offset === 0} onClick={() => (window.location.hash = withParams({ offset: String(Math.max(0, offset - limit)) }))}>
        ← Previous
      </button>
      <button disabled={offset + limit >= total} onClick={() => (window.location.hash = withParams({ offset: String(offset + limit) }))}>
        Next →
      </button>
    </div>
  )
}
