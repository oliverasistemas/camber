import { Tag } from 'antd'
import DataTable, { money } from './DataTable.jsx'

const statusColors = { NLSE: 'green', ULSE: 'blue', USLD: 'default', URIN: 'orange' }

export const columns = [
  { title: 'Asset No', dataIndex: 'asset_no', fixed: 'left' },
  { title: 'Lease', dataIndex: 'lease' },
  { title: 'Description', dataIndex: 'description' },
  { title: 'VIN', dataIndex: 'serial_number' },
  {
    title: 'Fuel',
    dataIndex: 'fuel_type',
    filters: ['GAS', 'DIESEL', 'HYBRID', 'ELECTRIC'].map((v) => ({ text: v, value: v })),
  },
  { title: 'Lessee', dataIndex: 'name' },
  { title: 'City', dataIndex: 'city' },
  { title: 'State', dataIndex: 'state' },
  {
    title: 'Status',
    dataIndex: 'status',
    filters: Object.keys(statusColors).map((v) => ({ text: v, value: v })),
    render: (v) => <Tag color={statusColors[v]}>{v}</Tag>,
  },
  { title: 'Contract Status', dataIndex: 'contr_status' },
  { title: 'In Service', dataIndex: 'in_svc_date' },
  { title: 'Sold', dataIndex: 'sold_date' },
  { title: 'Orig Cost', dataIndex: 'orig_cost', align: 'right', render: money },
  { title: 'Residual', dataIndex: 'residual', align: 'right', render: money },
  { title: 'Sale Proceeds', dataIndex: 'sale_proceeds', align: 'right', render: money },
  { title: 'Dealer', dataIndex: 'dealer_name' },
]

export default function Assets() {
  return <DataTable endpoint="/api/vervent/assets" rowKey="asset_no" columns={columns} noun="assets" />
}
