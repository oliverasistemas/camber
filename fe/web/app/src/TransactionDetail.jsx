import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Tag } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { contractLink, useRecord } from './records.jsx'
import { camberList } from './portfolios.jsx'

// What a transaction's amount was applied to; only the non-zero ones are shown.
const allocations = [
  ['payment', 'Payment'],
  ['prepayment', 'Prepayment'],
  ['payoff', 'Payoff'],
  ['inventory_sale', 'Inventory Sale'],
  ['paydown', 'Paydown'],
  ['property_tax', 'Property Tax'],
  ['sales_tax', 'Sales Tax'],
  ['late_charge', 'Late Charge'],
  ['collection_fee', 'Collection Fee'],
  ['assumption_fee', 'Assumption Fee'],
  ['legal_fee', 'Legal Fee'],
  ['pmt_extension', 'Pmt Extension'],
  ['lse_extension', 'Lse Extension'],
  ['itc_fees', 'ITC Fees'],
  ['fhut', 'FHUT'],
  ['idr', 'IDR'],
  ['lease_rewrite', 'Lease Rewrite'],
  ['other_fees', 'Other Fees'],
  ['security_deposit', 'Security Deposit'],
  ['suspense', 'Suspense'],
  ['rcr1', 'RCR1'],
  ['rcr2', 'RCR2'],
  ['rcr3', 'RCR3'],
]

// TransactionDetail is /vervent/transactions/:key: one transaction and a link to its contract.
export default function TransactionDetail() {
  const { key } = useParams()
  const { record: t, error } = useRecord(`/api/vervent/transactions/${encodeURIComponent(key)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to={camberList('/vervent/transactions')}>Transactions</Link> }, { title: key }]}
    />
  )
  if (t === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load transaction ${key}: ${error}`} /></>
  if (t === null) return <>{crumbs}<Result status="404" title={`Transaction ${key} not found`} /></>

  const applied = allocations.filter(([col]) => Number(t[col]))

  return (
    <>
      {crumbs}
      <PageHeader
        title={t.description || `Transaction ${t.transaction_key}`}
        subtitle={`Transaction ${t.transaction_key} · ${t.transaction_date_key}`}
        extra={
          <Flex gap="small">
            {t.is_non_cash ? <Tag>Non-cash</Tag> : <Tag color="green">Cash</Tag>}
            {t.is_past_due && <Tag color="red">Past due</Tag>}
            {t.is_payoff && <Tag color="blue">Payoff</Tag>}
          </Flex>
        }
      />
      <Flex vertical gap="large">
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Contract', children: contractLink(t.contract_number) },
              { label: 'Name', children: t.name },
              { label: 'Code', children: t.trans },
              { label: 'Amount', children: money(t.transaction_amount) },
              { label: 'Payment Amt', children: money(t.payment_amount) },
              { label: 'Date', children: t.transaction_date_key },
              { label: 'Effective', children: t.effective_date_key },
              { label: 'Posted', children: t.posted_date },
              { label: 'Due', children: t.invoice_due_date },
              { label: 'Check No', children: t.check_no },
              { label: 'Operator', children: t.oper_inits },
              { label: 'Source File', children: t.source_file },
            ]}
          />
        </Card>
        {applied.length > 0 && (
          <Card title="Applied to">
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, lg: 4 }}
              items={applied.map(([col, label]) => ({ label, children: money(t[col]) }))}
            />
          </Card>
        )}
      </Flex>
    </>
  )
}
