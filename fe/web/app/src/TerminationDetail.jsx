import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { miles, signedMoney, stageTag } from './Terminations.jsx'
import { assetLink, contractLink, useRecord, vinLink } from './records.jsx'
import { camberList } from './portfolios.jsx'

const days = (v) => (v == null ? '' : `${v} days`)
const yesNo = (v) => (v == null ? '' : v ? 'Yes' : 'No')
const lotLink = (lot) => lot != null && <Link to={`/copart/inventory?lot_nbr=${lot}`}>{lot}</Link>

// The Master Servicing lease termination tracker, section by section. items are the fields the
// lease_terminations view supplies: [label, column, render]. missing are the tracker's fields that no
// loaded file carries yet, listed so the gaps stay visible.
const sections = [
  {
    title: 'Lease and vehicle',
    items: [
      ['Lease', 'lease_no', contractLink],
      ['Asset', 'asset_no', (v) => assetLink(v)],
      ['VIN', 'vin', vinLink],
      ['Year', 'model_year'],
      ['Make', 'make'],
      ['Model', 'model'],
      ['Lessee', 'lessee_name'],
      ['State', 'lessee_state'],
      ['Term', 'term', (v) => v && `${v} mo`],
      ['Lease date', 'lease_date'],
      ['Maturity', 'maturity_date'],
      ['Orig cost', 'orig_cost', money],
      ['Contract residual', 'residual', money],
      ['Payment', 'payment', money],
      ['Lessor yield', 'lessor_yield', (v) => v != null && `${Number(v).toFixed(2)}%`],
    ],
    missing: ['Portfolio', 'Color', 'New/used', 'Open/closed lease', 'Business/personal', 'ALG model', 'Par values'],
  },
  {
    title: 'Vehicle status and valuation',
    items: [
      ['Contract status', 'ls_status'],
      ['Status date', 'ls_status_date'],
      ['Account', 'account_status'],
      ['Asset status', 'asset_status'],
      ['Repo status', 'repo_status'],
      ['Repo status date', 'repo_status_date'],
      ['Copart NADA ACV', 'nada_acv_value', money],
      ['Copart ProQuote', 'proquote', money],
    ],
    missing: [
      'Vehicle status 30/60/90 days ago',
      'MMR at lease inception',
      'MMR 12 months ago',
      'MMR current',
      'MMR at maturity',
      'Expected gain/(loss) on sale',
    ],
  },
  {
    title: 'Stage 0: Pre-termination outreach',
    items: [['Payoff amount', 'est_payoff', money]],
    missing: ['Outreach dates (180/120/90/60/30 days)', 'Customer recorded intent', 'LTV', 'Monthly payment with loan'],
  },
  {
    title: 'Stage 1: Termination scenario',
    items: [
      ['Termination date', 'termination_date'],
      ['Vs maturity', 'days_vs_maturity', days],
      ['Early termination', 'early_termination', yesNo],
      ['Remaining payments', 'remaining_receivables', money],
      ['Past due', 'total_past_due', money],
      ['Days delinquent', 'days_del'],
    ],
    missing: [
      'Termination type and subtype',
      'PV of remaining payments',
      'PV of contract residual',
      'Prior year PPT due',
      'Current year PPT due',
    ],
  },
  {
    title: 'Stage 2: Vehicle return and inspection',
    items: [
      ['Copart lot', 'lot_nbr', lotLink],
      ['Copart status', 'copart_status'],
      ['Received', 'copart_received_date'],
      ['Days in yard', 'days_in_yard'],
      ['Location', 'copart_location'],
      ['Condition score', 'auto_grade_score'],
      ['Mileage at turn-in', 'odometer', miles],
      ['Annual allowance', 'annual_mileage_allowance', miles],
      ['Total allowance', 'total_mileage_allowance', miles],
      ['Excess miles', 'excess_miles', miles],
      ['Overage rate', 'mileage_overage_rate', (v) => v != null && `${money(v)}/mi`],
      ['Excess mileage fee', 'excess_mileage_fee', money],
    ],
    missing: [
      'Condition report date',
      'Original mileage',
      'Excess wear fee',
      'Disposition fee',
      'Base and adjusted MMR',
      'Recondition amount',
      'Post-recon condition score',
    ],
    note: 'Mileage allowance and overage rate are unvalidated lease tape values. Excess miles assume the lease started at 0 miles.',
  },
  {
    title: 'Stage 3: Billing at lease termination',
    items: [],
    missing: ['Total due at termination', 'Termination invoice date', 'Termination amount invoiced'],
  },
  {
    title: 'Stage 4: Vehicle sale and billing',
    items: [
      ['Final reserve', 'reserve_amount', money],
      ['Auction runs', 'runs_at_auction'],
      ['Sale date', 'sale_date'],
      ['Channel', 'sale_channel'],
      ['Gross sale price', 'gross_sale_price', money],
      ['Auction fees', 'sale_fees', money],
      ['Copart net proceeds', 'copart_net_proceeds', money],
      ['Vervent sale proceeds', 'vervent_sale_proceeds', money],
      ['Net sale proceeds', 'net_sale_proceeds', money],
      ['Gain/(loss) vs residual', 'gain_loss', signedMoney],
    ],
    missing: [
      'Target sale price',
      'Floor and high bid per attempt',
      'Buyer name and location',
      'Net proceeds % of MMR',
      'Residual shortfall invoice',
    ],
    note: 'Gain/(loss) is provisional: net sale proceeds minus the contract residual.',
  },
  {
    title: 'Stage 5: Collections and accounts receivable',
    items: [['Copart title status', 'title_status']],
    missing: [
      'Total amount invoiced',
      'Amount collected',
      'Amount waived',
      'Amount charged off',
      'Accounts receivable',
      'Title released date',
      'Exception flag',
      'Notes',
    ],
  },
]

// TerminationDetail is /servicing/terminations/:leaseNo: one lease laid out as the lease
// termination tracker, with links on to its contract, asset, VIN and Copart lot.
export default function TerminationDetail() {
  const { leaseNo } = useParams()
  const { record: t, error } = useRecord(`/api/servicing/terminations/${encodeURIComponent(leaseNo)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to={camberList('/servicing/terminations')}>Lease terminations</Link> }, { title: leaseNo }]}
    />
  )
  if (t === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load lease ${leaseNo}: ${error}`} /></>
  if (t === null) return <>{crumbs}<Result status="404" title={`Lease ${leaseNo} not found`} /></>

  return (
    <>
      {crumbs}
      <PageHeader title={`Lease ${t.lease_no}`} subtitle={t.vehicle} extra={stageTag(t.stage)} />
      <Flex vertical gap="large">
        {sections.map((s) => (
          <Card key={s.title} title={s.title} size="small">
            {s.items.length > 0 && (
              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2, lg: 4 }}
                style={{ marginBottom: 8 }}
                items={s.items.map(([label, col, render]) => ({
                  key: col,
                  label,
                  children: render ? render(t[col]) : t[col],
                }))}
              />
            )}
            {s.note && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {s.note}
              </Typography.Paragraph>
            )}
            <Typography.Text type="secondary">No source yet: {s.missing.join(', ')}</Typography.Text>
          </Card>
        ))}
      </Flex>
    </>
  )
}
