import { useState } from 'react'
import { Alert, Breadcrumb, Button, Drawer, Flex, Table, Tag, Tooltip, Typography } from 'antd'
import { HistoryOutlined, SyncOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { LoadEvent, PipelineOverview, ReportFile, ScanResult } from '../types'
import { REPORTS, api, fileHref, fmtInt, reportLabel, when } from './api'
import { ColumnPicker } from './ColumnPicker'
import { useColumnVisibility } from './useColumnVisibility'

const { Text } = Typography

// Report is the row's link, so it always stays.
const PICKABLE = ['asOf', 'filename', 'cadence', 'rowCount', 'loadedAt']

const STATUS_COLOR: Record<string, string> = { loaded: 'green', failed: 'red', unchanged: 'default', skipped: 'default' }

/** #/pipeline — one row per Vervent file loaded into the vervent schema. */
export function ImportList({
  ov,
  error,
  reload,
  onUnauthorized,
}: {
  ov: PipelineOverview | null
  error: string
  reload: () => Promise<void>
  onUnauthorized: () => void
}) {
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  const proc = ov?.processor ?? null
  const { visibleKeys, setVisible } = useColumnVisibility('pipeline:imports', PICKABLE)

  async function runScan() {
    setScanning(true)
    setScanError('')
    try {
      const r = await api<ScanResult>('/api/pipeline/scan', { method: 'POST' }, onUnauthorized)
      if (r) {
        setScan(r)
        await reload()
      }
    } catch (e) {
      setScanError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

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
      render: (name: string, f) => (
        <Tooltip title={f.sha256 ? `sha256 ${f.sha256}` : undefined} placement="topLeft">
          <a href={fileHref(f.reportType, f.fileId)}>{name}</a>
        </Tooltip>
      ),
    },
    { title: 'Cadence', key: 'cadence', dataIndex: 'cadence', width: 100, responsive: ['md'], render: (c: string | null) => c ?? '' },
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

  const scanButton = (
    <Button type="primary" icon={<SyncOutlined spin={scanning} />} loading={false} disabled={!proc || scanning} onClick={runScan}>
      {scanning ? 'Scanning inbox' : 'Scan inbox'}
    </Button>
  )

  return (
    <>
      <Breadcrumb items={[{ title: <a href="#/">Pool dashboard</a> }, { title: 'Pipeline' }]} style={{ marginBottom: 14 }} />
      <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 20 }}>
        <div>
          <h1 className="deal-name">Pipeline</h1>
          <p className="deal-sub pipeline-lede">
            Vervent files loaded into the vervent schema. Open a file to read its rows.
            <br />
            <Text type="secondary">
              {proc
                ? `Watching ${proc.inbox} every ${proc.interval}${proc.running ? '. Scanning now.' : '.'}`
                : ov
                  ? 'No inbox is configured on this server, so files are loaded by hand.'
                  : ' '}
            </Text>
          </p>
        </div>
        <Flex gap={8}>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)} disabled={!ov}>
            Load history
          </Button>
          {proc ? scanButton : <Tooltip title="Set VERVENT_INBOX on the API to scan an inbox from here.">{scanButton}</Tooltip>}
        </Flex>
      </Flex>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {scanError && <Alert type="error" showIcon closable message={`Scan failed: ${scanError}`} style={{ marginBottom: 16 }} onClose={() => setScanError('')} />}
      {scan && <ScanSummary scan={scan} onClose={() => setScan(null)} />}

      <Flex className="list-toolbar">
        <ColumnPicker options={pickerOptions} visibleKeys={visibleKeys} onChange={setVisible} />
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
        locale={{ emptyText: proc ? 'No files loaded yet. Drop Vervent files in the inbox, then scan it.' : 'No files loaded yet.' }}
      />

      <Drawer
        title="Load history"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={Math.min(820, window.innerWidth)}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          The last 50 load attempts, newest first. Failed loads leave no file in the list.
        </Text>
        <Table<LoadEvent>
          rowKey="eventId"
          size="small"
          dataSource={ov?.events ?? []}
          pagination={false}
          scroll={{ x: 680 }}
          columns={[
            { title: 'When', dataIndex: 'at', width: 170, render: when },
            { title: 'File', dataIndex: 'filename', ellipsis: true },
            { title: 'Result', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
            { title: 'Rows', dataIndex: 'rowCount', width: 80, align: 'right', render: fmtInt },
            { title: 'Trigger', dataIndex: 'trigger', width: 80 },
            {
              title: 'Message',
              dataIndex: 'message',
              width: 220,
              render: (m: string | null) => (m ? <Text type="secondary">{m}</Text> : null),
            },
          ]}
        />
      </Drawer>
    </>
  )
}

function ScanSummary({ scan, onClose }: { scan: ScanResult; onClose: () => void }) {
  const failed = scan.files.filter((f) => f.status === 'failed')
  const counts = `${scan.loaded} loaded, ${scan.unchanged} unchanged, ${scan.failed} failed, ${scan.skipped} skipped.`
  return (
    <Alert
      type={scan.failed > 0 ? 'warning' : 'success'}
      showIcon
      closable
      onClose={onClose}
      style={{ marginBottom: 16 }}
      message={`Scanned inbox at ${when(scan.finishedAt)}. ${counts}`}
      description={
        failed.length > 0 ? (
          <ul className="scan-failures">
            {failed.map((f) => (
              <li key={f.path}>
                <Text strong>{f.filename}</Text>: {f.message}
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  )
}
