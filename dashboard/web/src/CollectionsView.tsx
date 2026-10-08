import { useEffect, useState } from 'react'
import { LeaseCollections, LeaseDetail } from './types'
import { Panel } from './Panel'
import { Columns } from './charts/Columns'
import { int, money, moneyFull, monthLabel, monthFull, axisMoney } from './format'

const STATUS_NAMES: Record<number, string> = { 0: 'Active', 1: 'In inventory', 2: 'Sold' }

function cents(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function cell(n: number | null): string {
  return n === null ? '—' : cents(n)
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

/** Month-by-month collections for one lease (#/lease/{id}/collections). */
export function CollectionsView({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const [data, setData] = useState<LeaseCollections | null>(null)
  const [lease, setLease] = useState<LeaseDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setLease(null)
    const guard = (r: Response) => {
      if (r.status === 401) {
        onUnauthorized()
        return null
      }
      if (r.status === 404) throw new Error('not found')
      if (!r.ok) throw new Error(`API returned ${r.status}`)
      return r.json()
    }
    fetch(`/api/leases/${id}/collections`)
      .then(guard)
      .then((x: LeaseCollections | null) => x && setData(x))
      .catch((e: Error) =>
        setError(
          e.message === 'not found'
            ? `No lease ${id} exists in this pool.`
            : 'The collections data is unavailable. Start the API with: go run ./dashboard/api',
        ),
      )
    fetch(`/api/leases/${id}`)
      .then(guard)
      .then((x: LeaseDetail | null) => x && setLease(x))
      .catch(() => {}) // header context only; the page works without it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!data) {
    return (
      <div className="app">
        <a className="crumb" href={`#/lease/${id}`}>
          ← Lease {id}
        </a>
        <h1 className="deal-name">Lease {id} — Collections</h1>
        <p className="deal-sub">{error || 'Loading collections…'}</p>
      </div>
    )
  }

  const months = data.months
  const reported = months.filter((m) => m.payment !== null)
  const latest = months[months.length - 1]
  const totalCollected = latest?.cumulativePayment ?? reported.reduce((a, m) => a + (m.payment ?? 0), 0)
  const eolTotal = reported.reduce((a, m) => a + (m.eolCollections ?? 0), 0)
  const rich = data.source === 'loan_tape'

  const COLS = [
    { name: 'Month' },
    { name: 'Total cash flow', numeric: true },
    { name: 'Property tax', numeric: true },
    { name: 'Sales tax', numeric: true },
    { name: 'Payment (excl. taxes)', numeric: true },
    { name: 'End-of-lease fees', numeric: true },
    { name: 'Past due', numeric: true },
    { name: 'Days past due', numeric: true },
    { name: 'Cumulative payments', numeric: true },
  ]

  return (
    <div className="app">
      <a className="crumb" href={`#/lease/${id}`}>
        ← Lease {id}
      </a>
      <h1 className="deal-name">Lease {id} — Collections</h1>
      <p className="deal-sub">
        {lease ? `${lease.description} · ${lease.vin} · ` : ''}
        {months.length > 0 ? (
          <>
            Servicer collections, {monthFull(months[0].month)} through {monthFull(months[months.length - 1].month)}
            {latest?.statusCode !== null && latest?.statusCode !== undefined && (
              <>
                {' · '}
                <strong>{STATUS_NAMES[latest.statusCode] ?? String(latest.statusCode)}</strong>
              </>
            )}
          </>
        ) : (
          'No collections history is loaded for this lease.'
        )}
      </p>

      {months.length > 0 && (
        <header className="masthead">
          <div className="kpis" style={{ width: '100%' }}>
            <Tile
              label="Collected to date"
              value={money(totalCollected)}
              note={rich ? 'payments since pool start, excl. taxes' : 'reported months, excl. taxes'}
            />
            <Tile
              label="Latest month"
              value={latest?.payment !== null && latest !== undefined ? money(latest.payment) : '—'}
              note={latest ? `collected in ${monthFull(latest.month)}` : ''}
            />
            <Tile
              label="Past due"
              value={latest?.pastDue !== null && latest !== undefined ? money(latest.pastDue) : '—'}
              note={
                latest?.daysDelinquent ? `${int(latest.daysDelinquent)} days delinquent` : 'current at the latest cutoff'
              }
            />
            <Tile label="End-of-lease fees" value={money(eolTotal)} note="mileage, wear and disposition collected" />
          </div>
        </header>
      )}

      {reported.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Panel
            title="Payments collected by month"
            sub="Cash collected on the lease, excluding property and sales tax"
            loading={false}
            table={{
              cols: COLS,
              rows: months.map((m) => [
                monthLabel(m.month),
                cell(m.totalCashFlow),
                cell(m.propertyTax),
                cell(m.salesTax),
                cell(m.payment),
                cell(m.eolCollections),
                cell(m.pastDue),
                m.daysDelinquent === null ? '—' : int(m.daysDelinquent),
                cell(m.cumulativePayment),
              ]),
            }}
          >
            <Columns
              items={reported.map((m) => ({
                label: monthLabel(m.month),
                value: m.payment ?? 0,
                tipTitle: monthFull(m.month),
                tipRows: [
                  { k: 'payment', v: moneyFull(m.payment ?? 0) },
                  ...(m.totalCashFlow !== null ? [{ k: 'total cash flow', v: moneyFull(m.totalCashFlow) }] : []),
                  ...(m.cumulativePayment !== null ? [{ k: 'cumulative', v: moneyFull(m.cumulativePayment) }] : []),
                ],
              }))}
              formatTick={axisMoney}
              directLabel={money}
            />
          </Panel>
        </div>
      )}

      <p className="footer-note">
        {rich
          ? 'Source: camber_credit.loan_tape, built monthly by the collections pipeline from Vervent transaction history. A month shown with dashes was carried forward from the prior tape without full collections detail.'
          : 'Source: camber_credit.lease_snapshots (distribution tape). Load the pipeline loan tape for the full cash-flow breakdown.'}
      </p>
    </div>
  )
}
