import { Tag } from 'antd'
import DataTable, { money } from './DataTable.jsx'

const statusColors = {
  'READY FOR AUCTION': 'blue',
  Closed: 'default',
  'Closed - OWNER RETAINED': 'purple',
  'WAITING FOR ORIGINAL TITLE': 'orange',
  'WAITING FOR TRANSFERABLE TITLE': 'orange',
  'WAITING FOR SELLER PAYMENT': 'gold',
  'SELLER HOLD PROGRAM': 'red',
  'OWNER RETAIN-SELLER OWES US': 'red',
}

const options = (values) => values.map((v) => ({ text: v, value: v }))

const columns = [
  { title: 'Lot', dataIndex: 'lot_nbr', fixed: 'left' },
  { title: 'VIN', dataIndex: 'vin' },
  { title: 'Year', dataIndex: 'year' },
  { title: 'Make', dataIndex: 'make' },
  { title: 'Model', dataIndex: 'model' },
  {
    title: 'Status',
    dataIndex: 'inventory_status',
    filters: options(Object.keys(statusColors)),
    render: (v) => <Tag color={statusColors[v]}>{v}</Tag>,
  },
  {
    title: 'Title',
    dataIndex: 'title_status',
    filters: options(['Completed', 'Awaiting Original Document', 'Awaiting Title Processing']),
  },
  { title: 'Yard', dataIndex: 'physical_location' },
  { title: 'Assigned', dataIndex: 'order_assignment_date' },
  { title: 'Received', dataIndex: 'order_received_date' },
  { title: 'Days in Yard', dataIndex: 'days_in_yard', align: 'right' },
  { title: 'Loss Type', dataIndex: 'loss_type', filters: options(['FLEET/LEASE', 'VOLUNTARY REPO', 'REPOSSESSION']) },
  { title: 'Damage', dataIndex: 'primary_damage' },
  { title: 'Drivability', dataIndex: 'drivability_rating', filters: options(['DRIVES', 'STARTS', 'NO']) },
  { title: 'Odometer', dataIndex: 'odometer', align: 'right', render: (v) => v?.toLocaleString('en-US') },
  { title: 'Grade', dataIndex: 'auto_grade_score', align: 'right' },
  { title: 'NADA ACV', dataIndex: 'nada_acv_value', align: 'right', render: money },
  { title: 'ProQuote', dataIndex: 'proquote', align: 'right', render: money },
  { title: 'Reserve', dataIndex: 'reserve_amount_on_final_auction', align: 'right', render: (v, r) => (r.reserve_set ? money(v) : '') },
  { title: 'Sold', dataIndex: 'date_of_sell' },
]

export default function CopartInventory() {
  return <DataTable endpoint="/api/copart/inventory" rowKey="lot_nbr" columns={columns} noun="vehicles" />
}
