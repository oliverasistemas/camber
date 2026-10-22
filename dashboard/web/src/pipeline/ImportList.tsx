import { Alert, Breadcrumb, Flex, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { PipelineOverview, ReportFile } from '../types'
import { REPORTS, fileHref, fmtInt, reportLabel, when } from './api'
import { ColumnPicker } from './ColumnPicker'
import { useColumnVisibility } from './useColumnVisibility'

const { Text } = Typography

// Report is the row's link, so it always stays.
const PICKABLE = ['asOf', 'filename', 'rowCount', 'loadedAt']

/** #/pipeline — one row per Vervent file loaded into the vervent schema. */
export function ImportList({ ov, error }: { ov: PipelineOverview | null; error: string }) {
  const proc = ov?.processor ?? null
  // Five columns in all, so every one is shown by default.
  const { visibleKeys, setVisible, reset, isDefault } = useColumnVisibility('pipeline:imports', PICKABLE, PICKABLE)

  const allColumns: ColumnsType<ReportFile> = [
    {
      title: 'As of',
      key: 'asOf',
      dataIndex: 'asOf',
      width: 112,
      sorter: (a, b) => a.asOf.localeCompare(b.asOf),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Report',
      key: 'reportType',
      dataIndex: 'reportType',
      width: 180,
      filters: REPORTS.map((r) => ({ text: r.label, value: r.type })),
      onFilter: (v, f) => f.reportType === v,
      render: (t: string, f) => <a href={fileHref(f.reportType, f.fileId)}>{reportLabel(t)}</a>,
    },
    {
      title: 'File',
      key: 'filename',
      dataIndex: 'filename',
      ellipsis: true,
      responsive: ['sm'],
      render: (name: string, f) => <a href={fileHref(f.reportType, f.fileId)}>{name}</a>,
    },
    {
      title: 'Rows',
      key: 'rowCount',
      dataIndex: 'rowCount',
      width: 84,
      align: 'right',
      sorter: (a, b) => (a.rowCount ?? 0) - (b.rowCount ?? 0),
      render: fmtInt,
    },
    {
      title: 'Loaded',
      key: 'loadedAt',
      dataIndex: 'loadedAt',
      width: 220,
      responsive: ['md'],
      sorter: (a, b) => a.loadedAt.localeCompare(b.loadedAt),
      render: when,
    },
  ]

  const columns = allColumns.map((c) =>
    PICKABLE.includes(String(c.key)) ? { ...c, hidden: !visibleKeys.includes(String(c.key)) } : c,
  )
  const pickerOptions = allColumns
    .filter((c) => PICKABLE.includes(String(c.key)))
    .map((c) => ({ key: String(c.key), label: String(c.title) }))

  return (
    <>
      <Breadcrumb items={[{ title: <a href="#/">Pool dashboard</a> }, { title: 'Pipeline' }]} style={{ marginBottom: 14 }} />
      <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 20 }}>
        <div>
          <h1 className="deal-name">Pipeline</h1>
          {proc && (
            <p className="deal-sub pipeline-lede">
              <Text type="secondary">{`Watching ${proc.inbox} every ${proc.interval}${proc.running ? '. Scanning now.' : '.'}`}</Text>
            </p>
          )}
        </div>
      </Flex>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Flex className="list-toolbar">
        <ColumnPicker options={pickerOptions} visibleKeys={visibleKeys} onChange={setVisible} onReset={reset} isDefault={isDefault} />
      </Flex>

      <Table<ReportFile>
        rowKey="fileId"
        size="middle"
        columns={columns}
        dataSource={ov?.files ?? []}
        loading={!ov && !error}
        pagination={(ov?.files.length ?? 0) > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        onRow={(f) => ({
          onClick: (e) => {
            if ((e.target as HTMLElement).closest('a')) return
            window.location.hash = fileHref(f.reportType, f.fileId)
          },
          style: { cursor: 'pointer' },
        })}
        locale={{ emptyText: proc ? 'No files loaded yet. Drop Vervent files in the inbox.' : 'No files loaded yet.' }}
      />

    </>
  )
}
