import { useEffect, useMemo, useState } from 'react'
import { Alert, Breadcrumb, Button, Descriptions, Flex, Pagination, Result, Segmented, Table, Typography } from 'antd'
import { FileSearchOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { PipelineOverview, ReportFile as ReportFileRow, StagedRows } from '../types'
import { ApiError, api, fileHref, fmtInt, reportLabel, when, type ReportDef } from './api'
import { ColumnPicker } from './ColumnPicker'
import { useColumnVisibility } from './useColumnVisibility'

const { Text } = Typography

const PAGE_SIZES = [25, 50, 100, 200]
const HIDDEN = new Set(['file_id', 'asof_date']) // shown once in the file header instead

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Y' : 'N'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** #/pipeline/<report-slug>/<fileId> — the rows of one loaded file, paged on the server. */
export function ReportFile({
  report,
  fileId,
  query,
  ov,
  onUnauthorized,
}: {
  report: ReportDef
  fileId: number
  query: URLSearchParams
  ov: PipelineOverview | null
  onUnauthorized: () => void
}) {
  const size = PAGE_SIZES.includes(Number(query.get('size'))) ? Number(query.get('size')) : 50
  const page = Math.max(1, Math.floor(Number(query.get('page'))) || 1)

  const [data, setData] = useState<StagedRows | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    const p = new URLSearchParams({ file: String(fileId), limit: String(size), offset: String((page - 1) * size) })
    api<StagedRows>(`/api/pipeline/staged/${report.type}?${p}`, undefined, onUnauthorized)
      .then((d) => {
        if (live && d) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: Error) => {
        if (!live) return
        // The id belongs to another report: send the reader to the right route.
        const other = e instanceof ApiError && e.status === 409 ? (e.body?.file as ReportFileRow | undefined) : undefined
        if (other?.reportType) {
          window.location.replace(fileHref(other.reportType, fileId, query))
          return
        }
        setError({ status: e instanceof ApiError ? e.status : 0, message: e.message })
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [report.type, fileId, page, size]) // eslint-disable-line react-hooks/exhaustive-deps

  const file = data?.file ?? ov?.files.find((f) => f.fileId === fileId) ?? null
  const siblings = file ? (ov?.files ?? []).filter((f) => f.asOf === file.asOf).sort((a, b) => a.reportType.localeCompare(b.reportType)) : []

  // Every column but the key can be hidden; the choice is remembered per report.
  const pickable = useMemo(
    () => (data?.columns ?? []).filter((c) => !HIDDEN.has(c) && !report.key.includes(c)),
    [data?.columns, report.key],
  )
  const { visibleKeys, setVisible } = useColumnVisibility(`pipeline:${report.type}`, pickable)

  const columns: ColumnsType<Record<string, unknown>> = useMemo(() => {
    if (!data) return []
    const sample = data.rows[0] ?? {}
    return data.columns
      .filter((c) => !HIDDEN.has(c) && (report.key.includes(c) || visibleKeys.includes(c)))
      .sort((a, b) => Number(report.key.includes(b)) - Number(report.key.includes(a)))
      .map((c) => {
        const numeric = typeof sample[c] === 'number'
        return {
          title: c,
          dataIndex: c,
          key: c,
          fixed: report.key.includes(c) ? ('left' as const) : undefined,
          align: numeric ? ('right' as const) : undefined,
          render: (v: unknown) => cell(v),
          onHeaderCell: () => ({ title: c }),
        }
      })
  }, [data, report.key, visibleKeys])

  function go(nextPage: number, nextSize: number) {
    const q = new URLSearchParams()
    if (nextPage > 1) q.set('page', String(nextPage))
    if (nextSize !== 50) q.set('size', String(nextSize))
    window.location.hash = fileHref(report.type, fileId, q)
  }

  const crumbs = [
    { title: <a href="#/">Pool dashboard</a> },
    { title: <a href="#/pipeline">Pipeline</a> },
    { title: report.label },
    { title: file?.asOf ?? `File ${fileId}` },
  ]

  if (error) {
    return (
      <>
        <Breadcrumb items={crumbs} style={{ marginBottom: 14 }} />
        <Result
          icon={error.status === 404 ? <FileSearchOutlined className="result-icon" /> : <WarningOutlined className="result-icon" />}
          title={error.status === 404 ? `No ${report.label} file with id ${fileId}` : `The rows of this file could not be loaded`}
          subTitle={error.status === 404 ? 'It may have been replaced by a newer load of the same file.' : error.message}
          extra={
            <Button type="primary" href="#/pipeline">
              Open the import list
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <Breadcrumb items={crumbs} style={{ marginBottom: 14 }} />
      <Flex justify="space-between" align="flex-end" gap={16} wrap className="file-head">
        <h1 className="deal-name">
          {report.label}
          <span className="file-asof">{file?.asOf ?? ''}</span>
        </h1>
        {siblings.length > 1 && (
          <Segmented
            aria-label="Other files from the same day"
            value={fileId}
            onChange={(v) => {
              const f = siblings.find((s) => s.fileId === v)
              if (f) window.location.hash = fileHref(f.reportType, f.fileId)
            }}
            options={siblings.map((s) => ({ label: reportLabel(s.reportType), value: s.fileId }))}
          />
        )}
      </Flex>

      <Descriptions
        className="file-label"
        size="small"
        bordered
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          { key: 'file', label: 'File', span: { xs: 1, sm: 2, lg: 2 }, children: file?.filename ?? '' },
          { key: 'rows', label: 'Rows', children: fmtInt(file?.rowCount ?? data?.total) },
          { key: 'loaded', label: 'Loaded', children: when(file?.loadedAt) },
          { key: 'cadence', label: 'Cadence', children: file?.cadence ?? 'none' },
          {
            key: 'sha',
            label: 'sha256',
            children: file?.sha256 ? (
              <Text copyable={{ text: file.sha256 }} className="sha">
                {file.sha256.slice(0, 16)}
              </Text>
            ) : (
              ''
            ),
          },
        ]}
      />

      {data && data.total === 0 && !loading && (
        <Alert type="info" showIcon message="No rows in this file." style={{ marginBottom: 16 }} />
      )}

      <Flex justify="space-between" align="center" gap={12} wrap className="rows-toolbar">
        <ColumnPicker options={pickable.map((c) => ({ key: c, label: c }))} visibleKeys={visibleKeys} onChange={setVisible} />
        {(data?.total ?? 0) > size && (
          <Pagination
            current={page}
            pageSize={size}
            total={data?.total ?? 0}
            pageSizeOptions={PAGE_SIZES}
            showSizeChanger
            showTotal={(t, [a, b]) => `${fmtInt(a)}–${fmtInt(b)} of ${fmtInt(t)} rows`}
            onChange={go}
          />
        )}
      </Flex>

      <Table<Record<string, unknown>>
        className="rows-table"
        size="small"
        rowKey={(r) => report.key.map((k) => cell(r[k])).join('|') || JSON.stringify(r)}
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={loading}
        sticky
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          pageSizeOptions: PAGE_SIZES,
          showSizeChanger: true,
          showTotal: (t, [a, b]) => `${fmtInt(a)}–${fmtInt(b)} of ${fmtInt(t)} rows`,
          onChange: go,
          position: ['bottomRight'],
        }}
      />
    </>
  )
}
