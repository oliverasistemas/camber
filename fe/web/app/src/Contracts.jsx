import { Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import DataTable, { money } from './DataTable.jsx'
import { contractLink } from './records.jsx'

const columns = [
  { title: 'Lease No', dataIndex: 'lease_no', fixed: 'left', render: contractLink },
  // The lease a deficiency contract belongs to; it lists the lease with all of its contracts.
  {
    title: 'Camber Lease',
    dataIndex: 'camber_lease_id',
    render: (v) => v && <Link to={`/vervent/contracts?camber_lease_id=${encodeURIComponent(v)}`}>{v}</Link>,
  },
  { title: 'Lessee', dataIndex: 'lessee_name' },
  { title: 'State', dataIndex: 'lessee_state' },
  { title: 'Asset', dataIndex: 'first_asset_desc' },
  { title: 'Type', dataIndex: 'ls_type' },
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
  { title: 'Commenced', dataIndex: 'commence_date' },
  { title: 'Maturity', dataIndex: 'maturity_date' },
  { title: 'Term', dataIndex: 'term', align: 'right' },
  { title: 'Orig Cost', dataIndex: 'orig_cost', align: 'right', render: money },
  { title: 'Payment', dataIndex: 'curr_pymt', align: 'right', render: money },
  { title: 'Remaining', dataIndex: 'remaining_receivables', align: 'right', render: money },
  {
    title: 'Days Del',
    dataIndex: 'days_del',
    align: 'right',
    render: (v) => (v > 0 ? <Typography.Text type="danger">{v}</Typography.Text> : v),
  },
  { title: 'Dealer', dataIndex: 'dlr_name' },
]

export default function Contracts() {
  return <DataTable endpoint="/api/vervent/contracts" rowKey="lease_no" columns={columns} noun="contracts" urlState />
}
