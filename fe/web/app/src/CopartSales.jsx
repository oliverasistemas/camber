import { Tag } from 'antd'
import DataTable, { money } from './DataTable.jsx'
import { vinLink } from './records.jsx'

const statusColors = { Closed: 'default', 'WAITING FOR SELLER PAYMENT': 'gold' }

export const columns = [
  { title: 'Lot', dataIndex: 'lot_nbr', fixed: 'left' },
  { title: 'VIN', dataIndex: 'vin', render: vinLink },
  { title: 'Year', dataIndex: 'year' },
  { title: 'Make', dataIndex: 'make' },
  { title: 'Model', dataIndex: 'model' },
  { title: 'Yard', dataIndex: 'physical_location' },
  { title: 'First Auction', dataIndex: 'first_auction_date' },
  { title: 'Sold', dataIndex: 'sale_date' },
  {
    title: 'Status',
    dataIndex: 'sales_status',
    filters: Object.keys(statusColors).map((v) => ({ text: v, value: v })),
    render: (v) => <Tag color={statusColors[v]}>{v}</Tag>,
  },
  { title: 'Runs', dataIndex: 'runs_at_auction', align: 'right' },
  { title: 'Bids', dataIndex: 'total_bids', align: 'right' },
  { title: 'ACV', dataIndex: 'acv', align: 'right', render: money },
  { title: 'ProQuote', dataIndex: 'proquote', align: 'right', render: money },
  { title: 'Reserve', dataIndex: 'reserve_amount_on_final_auction', align: 'right', render: money },
  { title: 'Gross', dataIndex: 'gross_sale_price', align: 'right', render: money },
  { title: 'Advance Charges', dataIndex: 'total_advance_charges', align: 'right', render: money },
  { title: 'Copart Charges', dataIndex: 'total_copart_charges', align: 'right', render: money },
  { title: 'Seller Charges', dataIndex: 'total_seller_charges', align: 'right', render: money },
  { title: 'Net Proceeds', dataIndex: 'net_sale_proceeds', align: 'right', render: money },
]

export default function CopartSales() {
  return <DataTable endpoint="/api/copart/sales" rowKey="lot_nbr" columns={columns} noun="sales" />
}
