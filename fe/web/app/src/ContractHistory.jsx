import { Tag, Typography } from 'antd'
import DataTable, { money } from './DataTable.jsx'
import { contractLink } from './records.jsx'

// One row per contract per ContractSummary file date (vervent_contract_snapshots): what the
// contract's receivables and delinquency were that day. Each row links to the contract.
export const columns = [
  { title: 'As of', dataIndex: 'file_date', fixed: 'left' },
  { title: 'Lease No', dataIndex: 'lease_no', render: contractLink },
  {
    title: 'Account',
    dataIndex: 'account_status',
    filters: [
      { text: 'Active', value: 'Active' },
      { text: 'Closed', value: 'Closed' },
    ],
    render: (v) => <Tag color={v === 'Active' ? 'green' : 'default'}>{v}</Tag>,
  },
  { title: 'Status', dataIndex: 'ls_status' },
  { title: 'Remaining', dataIndex: 'remaining_receivables', align: 'right', render: money },
  { title: 'Past Due', dataIndex: 'total_past_due', align: 'right', render: money },
  {
    title: 'Days Del',
    dataIndex: 'days_del',
    align: 'right',
    render: (v) => (v > 0 ? <Typography.Text type="danger">{v}</Typography.Text> : v),
  },
  { title: 'Bucket', dataIndex: 'curr_delinq' },
]

export const snapshotKey = (r) => `${r.file_date}|${r.lease_no}`

export default function ContractHistory() {
  return (
    <DataTable
      endpoint="/api/vervent/contract-snapshots"
      rowKey={snapshotKey}
      columns={columns}
      noun="daily contract rows"
      urlState
    />
  )
}
