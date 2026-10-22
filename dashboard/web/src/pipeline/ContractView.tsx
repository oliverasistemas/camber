import { useEffect, useMemo, useState } from 'react'
import { Alert, Breadcrumb, Button, Card, Collapse, Descriptions, Empty, Flex, Input, Result, Select, Space, Table, Tag, Typography } from 'antd'
import { FileSearchOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ContractDetail } from '../types'
import { ApiError, api, cell, contractHref, fmtInt, reportByType } from './api'
import { ColumnPicker } from './ColumnPicker'
import { useColumnVisibility } from './useColumnVisibility'

const { Text } = Typography

// The fields a servicing reader looks for first; everything else is under "All fields".
const CONTRACT_FIELDS = [
  'lessee_name',
  'lessee_no',
  'ls_status',
  'ls_source',
  'first_asset_desc',
  'lease_date',
  'maturity_date',
  'term',
  'curr_pymt',
  'last_paid_date',
  'remaining_receivables',
  'days_del',
  'total_past_due',
]
const ASSET_FIELDS = ['description', 'serial_number', 'status', 'contr_status', 'orig_cost', 'residual', 'in_svc_date']
const HIDDEN = new Set(['file_id', 'loaded_at'])
const TXN = reportByType('transaction_history')!
const TXN_DEFAULTS = ['asof_date', ...TXN.defaults.filter((c) => c !== 'contract_number')]

/** The Descriptions items of one row: the chosen fields, or every filled field in column order. */
function fieldItems(row: Record<string, unknown>, fields: string[]) {
  return fields.filter((f) => f in row).map((f) => ({ key: f, label: f, children: cell(row[f]) }))
}

function AllFields({ row, columns }: { row: Record<string, unknown>; columns: string[] }) {
  const cols = columns.filter((c) => !HIDDEN.has(c))
  const filled = cols.filter((c) => row[c] !== null && row[c] !== undefined && row[c] !== '')
  return (
    <Collapse
      size="small"
      className="all-fields"
      items={[
        {
          key: 'all',
          label: `All fields (${fmtInt(filled.length)} filled, ${fmtInt(cols.length - filled.length)} empty)`,
          children: <Descriptions size="small" bordered column={{ xs: 1, sm: 2, lg: 3 }} items={fieldItems(row, filled)} />,
        },
      ]}
    />
  )
}

/** #/pipeline/contract/<leaseNo>?asof= — one contract, its asset on that day, and all its staged transactions. */
export function ContractView({ leaseNo, asOf, onUnauthorized }: { leaseNo: string; asOf: string | null; onUnauthorized: () => void }) {
  const [data, setData] = useState<ContractDetail | null>(null)
  const [error, setError] = useState<{ status: number; message: string; asOfs?: string[] } | null>(null)

  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    const q = asOf ? `?asof=${encodeURIComponent(asOf)}` : ''
    api<ContractDetail>(`/api/pipeline/contracts/${encodeURIComponent(leaseNo)}${q}`, undefined, onUnauthorized)
      .then((d) => live && d && setData(d))
      .catch((e: Error) => {
        if (!live) return
        const status = e instanceof ApiError ? e.status : 0
        const asOfs = e instanceof ApiError && Array.isArray(e.body?.asOfs) ? (e.body.asOfs as string[]) : undefined
        setError({ status, message: e.message, asOfs })
      })
    return () => {
      live = false
    }
  }, [leaseNo, asOf]) // eslint-disable-line react-hooks/exhaustive-deps

  const txnColumns = data?.columns.transaction_history ?? []
  const pickable = useMemo(() => txnColumns.filter((c) => !HIDDEN.has(c) && !TXN.key.includes(c) && c !== 'contract_number'), [txnColumns])
  const { visibleKeys, setVisible, reset, isDefault } = useColumnVisibility('pipeline:contract:transactions', pickable, TXN_DEFAULTS)

  const columns: ColumnsType<Record<string, unknown>> = useMemo(() => {
    const sample = data?.transactions[0] ?? {}
    return txnColumns
      .filter((c) => TXN.key.includes(c) || visibleKeys.includes(c))
      .map((c, i) => ({ c, rank: TXN.key.includes(c) ? -1 : TXN_DEFAULTS.includes(c) ? TXN_DEFAULTS.indexOf(c) : 1000 + i }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ c }) => ({
        title: c,
        dataIndex: c,
        key: c,
        fixed: TXN.key.includes(c) ? ('left' as const) : undefined,
        align: typeof sample[c] === 'number' ? ('right' as const) : undefined,
        render: (v: unknown) => cell(v),
        onHeaderCell: () => ({ title: c }),
      }))
  }, [data, txnColumns, visibleKeys])

  const crumbs = [
    { title: <a href="#/">Pool dashboard</a> },
    { title: <a href="#/pipeline">Pipeline</a> },
    { title: 'Contract' },
    { title: leaseNo },
  ]
  const lookup = (
    <Input.Search
      className="contract-lookup"
      placeholder="Lease number"
      aria-label="Open another contract by lease number"
      enterButton="Open"
      allowClear
      onSearch={(v) => {
        const s = v.trim().toUpperCase()
        if (s) window.location.hash = contractHref(s)
      }}
    />
  )

  if (error) {
    const missing = error.status === 404
    return (
      <>
        <Breadcrumb items={crumbs} style={{ marginBottom: 14 }} />
        <Result
          icon={missing ? <FileSearchOutlined className="result-icon" /> : <WarningOutlined className="result-icon" />}
          title={missing ? (asOf ? `Contract ${leaseNo} was not staged on ${asOf}` : `No staged contract ${leaseNo}`) : 'The contract could not be loaded'}
          subTitle={missing ? 'Lease numbers are 10 characters; deficiency contracts end in D or P.' : error.message}
          extra={
            <Flex vertical align="center" gap={12}>
              {error.asOfs?.length ? <Button type="primary" href={contractHref(leaseNo)}>Open its latest day ({error.asOfs[0]})</Button> : null}
              {lookup}
            </Flex>
          }
        />
      </>
    )
  }

  const c = data?.contract ?? {}
  const isDeficiency = data ? data.leaseNoNorm !== null && data.leaseNoNorm !== data.leaseNo : false

  return (
    <>
      <Breadcrumb items={crumbs} style={{ marginBottom: 14 }} />
      <Flex justify="space-between" align="flex-end" gap={16} wrap className="file-head">
        <h1 className="deal-name">
          Contract {leaseNo}
          <span className="file-asof">{data?.asOf ?? ''}</span>
        </h1>
        <Space wrap>
          {data && data.asOfs.length > 1 && (
            <Select
              aria-label="As-of date"
              value={data.asOf}
              onChange={(v) => (window.location.hash = contractHref(leaseNo, v === data.asOfs[0] ? undefined : v))}
              options={data.asOfs.map((d) => ({ value: d, label: d }))}
            />
          )}
          {lookup}
        </Space>
      </Flex>

      {data && data.related.length > 0 && (
        <Alert
          className="contract-related"
          type="info"
          showIcon
          message={
            <>
              {isDeficiency ? 'Deficiency balance contract. Original lease and its other contracts: ' : 'Deficiency balance contracts of this lease: '}
              {data.related.map((r, i) => (
                <span key={r.leaseNo}>
                  {i > 0 && ', '}
                  <a href={contractHref(r.leaseNo, data.asOf === data.asOfs[0] ? undefined : data.asOf)}>{r.leaseNo}</a>
                  {r.assetDesc && <Text type="secondary"> ({r.assetDesc})</Text>}
                </span>
              ))}
            </>
          }
        />
      )}

      <Card size="small" title="Contract" loading={!data} className="contract-card">
        <Descriptions className="file-label" size="small" bordered column={{ xs: 1, sm: 2, lg: 3 }} items={fieldItems(c, CONTRACT_FIELDS)} />
        {data && <AllFields row={c} columns={data.columns.contract_summary ?? []} />}
      </Card>

      <Card size="small" title={data && data.assets.length > 1 ? `Assets (${data.assets.length})` : 'Asset'} loading={!data} className="contract-card">
        {data && data.assets.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No asset on this contract on ${data.asOf}`} />}
        {data?.assets.map((a) => (
          <div key={cell(a.asset_no)} className="contract-asset">
            <Text strong>
              Asset {cell(a.asset_no)} {isDeficiency && <Tag>placeholder, no vehicle</Tag>}
            </Text>
            <Descriptions className="file-label" size="small" bordered column={{ xs: 1, sm: 2, lg: 3 }} items={fieldItems(a, ASSET_FIELDS)} />
            <AllFields row={a} columns={data.columns.asset_summary ?? []} />
          </div>
        ))}
      </Card>

      <Card
        size="small"
        title={`Transactions${data ? ` (${fmtInt(data.transactions.length)})` : ''}`}
        extra={
          data && data.transactions.length > 0 ? (
            <ColumnPicker
              options={pickable.map((k) => ({ key: k, label: k }))}
              visibleKeys={visibleKeys}
              onChange={setVisible}
              onReset={reset}
              isDefault={isDefault}
            />
          ) : null
        }
        className="contract-card"
      >
        {data && data.transactions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No transactions staged for this contract" />
        ) : (
          <Table<Record<string, unknown>>
            className="rows-table"
            size="small"
            rowKey={(r) => cell(r.transaction_key)}
            columns={columns}
            dataSource={data?.transactions ?? []}
            loading={!data}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 25, hideOnSinglePage: true, showTotal: (t, [a, b]) => `${fmtInt(a)}–${fmtInt(b)} of ${fmtInt(t)}` }}
          />
        )}
      </Card>
      <Text type="secondary" className="contract-note">
        Transactions are every staged daily Transaction History row for {leaseNo}, across all as-of dates, newest posting first.
      </Text>
    </>
  )
}
