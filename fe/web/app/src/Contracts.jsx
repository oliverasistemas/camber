import { useState } from 'react'
import { Tag, Typography } from 'antd'
import DataTable, { money } from './DataTable.jsx'
import ContractDetail from './ContractDetail.jsx'

const columns = [
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
  const [selected, setSelected] = useState(null)

  const leaseColumn = {
    title: 'Lease No',
    dataIndex: 'lease_no',
    fixed: 'left',
    render: (v, row) => <Typography.Link onClick={() => setSelected(row)}>{v}</Typography.Link>,
  }

  return (
    <>
      <DataTable
        endpoint="/api/vervent/contracts"
        rowKey="lease_no"
        columns={[leaseColumn, ...columns]}
        noun="contracts"
      />
      <ContractDetail contract={selected} onClose={() => setSelected(null)} />
    </>
  )
}
