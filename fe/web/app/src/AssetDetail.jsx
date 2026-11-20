import { Alert, Breadcrumb, Card, Descriptions, Flex, Result, Spin, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import DataTable, { money } from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { statusColors } from './Assets.jsx'
import { columns as inventoryColumns } from './CopartInventory.jsx'
import { columns as salesColumns } from './CopartSales.jsx'
import { contractLink, useRecord } from './records.jsx'
import { camberList } from './portfolios.jsx'

// The vehicle is already described in the page header, so drop it from the Copart tables.
const vehicleFields = ['vin', 'year', 'make', 'model']
const inventoryCols = inventoryColumns.filter((c) => !vehicleFields.includes(c.dataIndex))
const salesCols = salesColumns.filter((c) => !vehicleFields.includes(c.dataIndex))

// AssetDetail is /vervent/assets/:assetNo: the asset, a link to its contract, and the Copart
// lots for its VIN (serial_number).
export default function AssetDetail() {
  const { assetNo } = useParams()
  const { record: a, error } = useRecord(`/api/vervent/assets/${encodeURIComponent(assetNo)}`)

  const crumbs = (
    <Breadcrumb
      style={{ marginBottom: 12 }}
      items={[{ title: <Link to={camberList('/vervent/assets')}>Assets</Link> }, { title: assetNo }]}
    />
  )
  if (a === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (error) return <>{crumbs}<Alert type="error" showIcon message={`Failed to load asset ${assetNo}: ${error}`} /></>
  if (a === null) return <>{crumbs}<Result status="404" title={`Asset ${assetNo} not found`} /></>

  return (
    <>
      {crumbs}
      <PageHeader
        title={a.description || `Asset ${a.asset_no}`}
        subtitle={a.serial_number && `VIN ${a.serial_number}`}
        extra={<Tag color={statusColors[a.status]}>{a.status}</Tag>}
      />
      <Flex vertical gap="large">
        <Card>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            items={[
              { label: 'Asset No', children: a.asset_no },
              { label: 'Lease', children: contractLink(a.lease) },
              { label: 'Lessee', children: a.name },
              { label: 'Location', children: [a.city, a.state].filter(Boolean).join(', ') },
              { label: 'Contract Status', children: a.contr_status },
              { label: 'In Service', children: a.in_svc_date },
              { label: 'Sold', children: a.sold_date },
              { label: 'Repo Status', children: a.curr_repo_status },
              { label: 'Orig Cost', children: money(a.orig_cost) },
              { label: 'Residual', children: money(a.residual) },
              { label: 'Sale Proceeds', children: money(a.sale_proceeds) },
              { label: 'Dealer', children: a.dealer_name },
            ]}
          />
        </Card>
        {a.serial_number && (
          <>
            <div>
              <Typography.Title level={5}>Copart inventory</Typography.Title>
              <DataTable
                endpoint="/api/copart/inventory"
                rowKey="lot_nbr"
                columns={inventoryCols}
                noun="lots"
                baseFilters={{ vin: a.serial_number }}
                pageSize={5}
              />
            </div>
            <div>
              <Typography.Title level={5}>Copart sales</Typography.Title>
              <DataTable
                endpoint="/api/copart/sales"
                rowKey="lot_nbr"
                columns={salesCols}
                noun="sales"
                baseFilters={{ vin: a.serial_number }}
                pageSize={5}
              />
            </div>
          </>
        )}
      </Flex>
    </>
  )
}
