import { useEffect, useState } from 'react'
import { LeaseDetail } from './types'
import { int, moneyFull, pct, dateLabel, monthFull } from './format'

const OBLIGOR: Record<string, string> = { B: 'Business', P: 'Personal' }
const NEW_USED: Record<string, string> = { N: 'New', U: 'Used' }
const OPEN_CLOSED: Record<string, string> = { O: 'Open-ended', C: 'Closed-ended' }

function fuelLabel(f: string): string {
  return f.charAt(0) + f.slice(1).toLowerCase()
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="dl">
      {rows.map(([k, v]) => (
        <div className="dl-row" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({ title, sub, rows }: { title: string; sub?: string; rows: [string, string][] }) {
  return (
    <section className="panel">
      <h3 className="panel-title">{title}</h3>
      {sub && <p className="panel-sub">{sub}</p>}
      <Rows rows={rows} />
    </section>
  )
}

export function LeaseView({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const [d, setD] = useState<LeaseDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setD(null)
    fetch(`/api/leases/${id}`)
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        if (r.status === 404) throw new Error('not found')
        if (!r.ok) throw new Error(`API returned ${r.status}`)
        return r.json()
      })
      .then((x: LeaseDetail | null) => x && setD(x))
      .catch((e: Error) =>
        setError(e.message === 'not found' ? `No lease ${id} exists in this pool.` : 'The lease is unavailable. Start the API with: go run ./dashboard/api'),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!d) {
    return (
      <div className="app">
        <a className="crumb" href="#/">
          ← Pool dashboard
        </a>
        <h1 className="deal-name">Lease {id}</h1>
        <p className="deal-sub">{error || 'Loading lease…'}</p>
      </div>
    )
  }

  const contract: [string, string][] = [
    ['Lease date', dateLabel(d.leaseDate)],
    ['Scheduled maturity', dateLabel(d.maturityDate)],
    ['Term', `${d.termMonths} months${d.isExtended ? ' (extended)' : ''}`],
    ['Structure', OPEN_CLOSED[d.openClosed] ?? d.openClosed],
    ['Obligor', OBLIGOR[d.obligorType] ?? d.obligorType],
    ['Monthly payment', moneyFull(d.paymentRegular)],
    ['Original cost', moneyFull(d.origCost)],
    ['Contract residual', moneyFull(d.contractResidual)],
    ['Implied rate', pct(d.leaseDcf, 2)],
    ['ALG residual model', d.algModel],
  ]

  const vehicle: [string, string][] = [
    ['VIN', d.vin],
    ['Model year', String(d.modelYear)],
    ['Description', d.description],
    ['Fuel type', fuelLabel(d.fuelType)],
    ['Condition at inception', NEW_USED[d.newUsed] ?? d.newUsed],
  ]

  const servicing: [string, string][] = [['Status', d.statusName ?? '—']]
  if (d.terminationType) servicing.push(['Termination', d.terminationType])
  if (d.terminationTiming) servicing.push(['Termination timing vs maturity', d.terminationTiming])
  if (d.soldMonth) servicing.push(['Vehicle sold', monthFull(d.soldMonth)])
  if (d.netSalesProceeds !== null) servicing.push(['Net sales proceeds', moneyFull(d.netSalesProceeds)])
  if (d.statusCode === 0) {
    servicing.push(['Days delinquent', d.daysDelinquent ? int(d.daysDelinquent) : 'Current'])
    servicing.push(['Payments remaining', int(d.paymentsRemaining ?? 0)])
  }
  if (d.periodPaymentCollected !== null) servicing.push(['August payment collected', moneyFull(d.periodPaymentCollected)])
  servicing.push(['Eligible collateral', d.isEligible ? 'Yes' : 'No'])

  const valuation: [string, string][] = []
  if (d.pvTotal !== null) valuation.push(['Par value (remaining cash flows)', moneyFull(d.pvTotal)])
  if (d.pvContractResidual !== null) valuation.push(['Par value of contract residual', moneyFull(d.pvContractResidual)])
  if (d.pvEligible !== null) valuation.push(['Eligible-collateral par value', moneyFull(d.pvEligible)])
  if (d.pvTotalPrior !== null) valuation.push(['Par value as of Oct 31, 2025', moneyFull(d.pvTotalPrior)])

  return (
    <div className="app">
      <button className="crumb crumb-btn" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = '#/'))}>
        ← Back
      </button>
      <h1 className="deal-name">Lease {d.leaseId}</h1>
      <p className="deal-sub">
        {d.description} · {d.vin} · <strong>{d.statusName ?? 'No snapshot'}</strong>
        {' · '}
        <a href={`#/lease/${d.leaseId}/collections`}>Monthly collections →</a>
      </p>

      <div className="grid detail-grid">
        <Section title="Contract" sub="Inception terms from the lease tape" rows={contract} />
        <Section title="Vehicle" rows={vehicle} />
        <Section title="Servicing" sub="As of the August 31, 2026 cutoff" rows={servicing} />
        {valuation.length > 0 && (
          <Section
            title="Valuation"
            sub={`Discounted cash flow at ${d.discountRate !== null ? pct(d.discountRate, 0) : '9%'}, as of August 31, 2026`}
            rows={valuation}
          />
        )}
      </div>

      <p className="footer-note">Source: camber_credit schema, lease tape distributed August 2026.</p>
    </div>
  )
}
