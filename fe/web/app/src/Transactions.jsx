import { Tag } from 'antd'
import DataTable, { money } from './DataTable.jsx'

const descriptions = [
  'ACCRUAL NORMAL CYCLE',
  'ACC REV NORMAL CYCLE',
  'NEW LEASE ADD',
  'PAYMENT NORMAL',
  'PARTIAL PAYMENT',
  'PAYMENT USE TAX',
  'PAYMENT PROPERTY TAX',
  'PAYMENT LATE CHARGE',
  'PRE-PAYMENT',
  'PAYOFF EARLY',
]

const yesNo = [
  { text: 'Yes', value: 'true' },
  { text: 'No', value: 'false' },
]

export const columns = [
  { title: 'Key', dataIndex: 'transaction_key', fixed: 'left' },
  { title: 'Date', dataIndex: 'transaction_date_key' },
  { title: 'Contract', dataIndex: 'contract_number' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Code', dataIndex: 'trans' },
  {
    title: 'Description',
    dataIndex: 'description',
    filters: descriptions.map((v) => ({ text: v, value: v })),
  },
  {
    title: 'Non-Cash',
    dataIndex: 'is_non_cash',
    filters: yesNo,
    render: (v) => (v ? <Tag>Non-cash</Tag> : <Tag color="green">Cash</Tag>),
  },
  {
    title: 'Past Due',
    dataIndex: 'is_past_due',
    filters: yesNo,
    render: (v) => (v ? <Tag color="red">Past due</Tag> : null),
  },
  { title: 'Amount', dataIndex: 'transaction_amount', align: 'right', render: money },
  { title: 'Payment Amt', dataIndex: 'payment_amount', align: 'right', render: money },
  { title: 'Check No', dataIndex: 'check_no' },
  { title: 'Due', dataIndex: 'invoice_due_date' },
  { title: 'Operator', dataIndex: 'oper_inits' },
]

export default function Transactions() {
  return (
    <DataTable
      endpoint="/api/vervent/transactions"
      rowKey="transaction_key"
      columns={columns}
      noun="transactions"
    />
  )
}
