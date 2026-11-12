import { Descriptions, Drawer, Flex, Tag, Typography } from 'antd'
import DataTable, { money } from './DataTable.jsx'
import { columns as assetColumns } from './Assets.jsx'
import { columns as transactionColumns } from './Transactions.jsx'

// The lease number and lessee are already in the drawer header, so drop them from the tables.
const assetCols = assetColumns.filter((c) => !['lease', 'name'].includes(c.dataIndex))
const transactionCols = transactionColumns.filter(
  (c) => !['contract_number', 'name'].includes(c.dataIndex),
)

export default function ContractDetail({ contract, onClose }) {
  const c = contract ?? {}
  return (
    <Drawer
      open={!!contract}
      onClose={onClose}
      width="min(1200px, 92vw)"
      title={
        <Flex align="center" gap="small">
          <span>Lease {c.lease_no}</span>
          <Typography.Text type="secondary">{c.lessee_name}</Typography.Text>
          <Tag color={c.account_status === 'Active' ? 'green' : 'default'}>{c.account_status}</Tag>
        </Flex>
      }
    >
      {contract && (
        <Flex vertical gap="large">
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 4 }}
            bordered
            items={[
              { label: 'Status', children: c.ls_status },
              { label: 'Type', children: c.ls_type },
              { label: 'Commenced', children: c.commence_date },
              { label: 'Maturity', children: c.maturity_date },
              { label: 'Term', children: `${c.term} mo` },
              { label: 'Orig Cost', children: money(c.orig_cost) },
              { label: 'Payment', children: money(c.curr_pymt) },
              { label: 'Remaining', children: money(c.remaining_receivables) },
              { label: 'Past Due', children: money(c.total_past_due) },
              { label: 'Days Del', children: c.days_del },
              { label: 'Est Payoff', children: money(c.est_payoff) },
              { label: 'Dealer', children: c.dlr_name },
            ]}
          />
          <div>
            <Typography.Title level={5}>Assets</Typography.Title>
            <DataTable
              endpoint="/api/vervent/assets"
              rowKey="asset_no"
              columns={assetCols}
              noun="assets"
              baseFilters={{ lease: c.lease_no }}
              pageSize={5}
              bordered={false}
            />
          </div>
          <div>
            <Typography.Title level={5}>Transactions</Typography.Title>
            <DataTable
              endpoint="/api/vervent/transactions"
              rowKey="transaction_key"
              columns={transactionCols}
              noun="transactions"
              baseFilters={{ contract_number: c.lease_no }}
              pageSize={10}
              bordered={false}
            />
          </div>
        </Flex>
      )}
    </Drawer>
  )
}
