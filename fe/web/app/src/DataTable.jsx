import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Table, Tag } from 'antd'
import { columnFilter } from './ColumnFilters.jsx'

export const money = (v) =>
  v == null ? '' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// compact and compactMoney abbreviate thousands and millions (12.3K, $1.2M) for cards and chart
// labels, where the figure is a headline. Tables and detail pages show exact values with money.
const compactOptions = { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }
export const compact = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', compactOptions))
export const compactMoney = (v) =>
  v == null ? '' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', ...compactOptions })

// dateTime shows a timestamptz in the viewer's time zone; bytes abbreviates a file size.
export const dateTime = (v) =>
  v == null ? '' : new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
export const bytes = (v) =>
  v == null ? '' : `${compact(v)}B`

// Filter parameters can carry a comparison suffix (days_del.gt=0); see filterOps in be/rest/vervent.go.
const opSymbols = { gt: '>', gte: '≥', lt: '<', lte: '≤', ne: '≠', like: 'contains' }

// Query string parameters that are not column filters.
const reserved = ['page', 'limit', 'sort']

// useTableQuery holds the page, sort and filters. With urlState they live in the query string,
// spelled like the API's own parameters (?status=NLSE&days_del.gt=0&sort=-days_del&page=2), so a
// filtered list can be linked to; otherwise they are local state.
function useTableQuery(urlState, pageSize, defaultSort) {
  const local = useState({ page: 1, pageSize, filters: {}, sort: defaultSort })
  const [params, setParams] = useSearchParams()
  if (!urlState) return local

  const query = {
    page: Number(params.get('page')) || 1,
    pageSize: Number(params.get('limit')) || pageSize,
    filters: Object.fromEntries([...params].filter(([k]) => !reserved.includes(k))),
    sort: params.get('sort') ?? defaultSort,
  }
  const setQuery = (q) => {
    const next = new URLSearchParams(q.filters)
    if (q.sort && q.sort !== defaultSort) next.set('sort', q.sort)
    if (q.page > 1) next.set('page', q.page)
    if (q.pageSize !== pageSize) next.set('limit', q.pageSize)
    setParams(next)
  }
  return [query, setQuery]
}

// DataTable shows one /api/vervent/*, /api/copart/* or /api/servicing/* list with server-side paging, sorting and filtering.
// Every column is sortable and can be filtered: a column with `filters` by exact match on one of
// those values, any other by a date range, number range or text search (ColumnFilters.jsx).
// The Excel button downloads every row the current filters match, in the current order.
// baseFilters are fixed column filters always sent, e.g. { lease: '5000080213' }.
// urlState keeps the page, sort and filters in the query string: for the one main table of a list
// page, not for tables embedded in a detail page. Filters the columns have no control for (a
// dashboard drill-down such as days_del.gt=0, or a range or search) show as removable tags above the table.
// col.ne=null, any value at all, reads "<title> is set", or as the column's anyLabel if it has one.
// defaultSort (col or -col) orders the table until the user picks a sort; clearing the sort returns to it.
// bordered wraps the table in a card; the contract drawer turns it off.
// sums lists columns (by dataIndex) to total in a last row. The server adds them up over every row
// the filters match, not just the page shown, so the total is the figure a card links here with.
export default function DataTable({ endpoint, rowKey, columns, noun, baseFilters, defaultSort = null, pageSize = 20, bordered = true, urlState = false, sums }) {
  const [query, setQuery] = useTableQuery(urlState, pageSize, defaultSort)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const baseKey = JSON.stringify(baseFilters ?? {})
  const sumKey = sums?.join(',') ?? ''
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    const params = new URLSearchParams({
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    })
    for (const [col, value] of Object.entries({ ...baseFilters, ...query.filters })) {
      params.set(col, value)
    }
    if (query.sort) params.set('sort', query.sort)
    if (sumKey) params.set('sum', sumKey)

    let cancelled = false
    setLoading(true)
    fetch(`${endpoint}?${params}`)
      .then((res) => {
        // Session expired or was invalidated: reload so App falls back to the login page.
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((body) => {
        if (cancelled) return
        setResult(body)
        setError(null)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [endpoint, baseKey, queryKey, sumKey])

  // Filters with a column control belong to the table; the rest are shown as tags.
  const controlled = new Set(columns.filter((c) => c.filters).map((c) => c.dataIndex))
  const extraFilters = Object.entries(query.filters).filter(([k]) => !controlled.has(k))
  const [sortCol, sortDesc] = query.sort?.startsWith('-') ? [query.sort.slice(1), true] : [query.sort, false]

  const filterLabel = (param, value) => {
    const [col, op] = param.split('.')
    const column = columns.find((c) => c.dataIndex === col)
    const title = column?.title ?? col.replaceAll('_', ' ')
    if (op === 'ne' && value === 'null') return column?.anyLabel ?? `${title} is set`
    return `${title} ${opSymbols[op] ?? '='} ${value}`
  }

  const onChange = (pagination, tableFilters, sorter) => {
    const picked = Object.fromEntries(
      Object.entries(tableFilters)
        .filter(([, v]) => v?.length)
        .map(([col, v]) => [col, v[0]]),
    )
    // A value picked for a column replaces any other filter on it (camber_portfolio.ne=null).
    const filters = { ...Object.fromEntries(extraFilters.filter(([k]) => !(k.split('.')[0] in picked))), ...picked }
    // Clearing a sort falls back to defaultSort; clearing a descending defaultSort itself turns it
    // ascending, or the header could never leave descending.
    const cleared = query.sort === defaultSort && defaultSort?.startsWith('-') ? defaultSort.slice(1) : defaultSort
    const sort = sorter.order ? `${sorter.order === 'descend' ? '-' : ''}${sorter.field}` : cleared
    const reset = JSON.stringify(filters) !== JSON.stringify(query.filters) || sort !== query.sort
    setQuery({ page: reset ? 1 : pagination.current, pageSize: pagination.pageSize, filters, sort })
  }

  const removeFilter = (param) => {
    const { [param]: _, ...filters } = query.filters
    setQuery({ ...query, page: 1, filters })
  }

  // setColumnFilter replaces every filter on col (col, col.gte, col.like, ...) with params.
  const setColumnFilter = (col, params) => {
    const others = Object.entries(query.filters).filter(([k]) => k !== col && !k.startsWith(`${col}.`))
    setQuery({ ...query, page: 1, filters: { ...Object.fromEntries(others), ...params } })
  }

  const exportParams = new URLSearchParams({ ...baseFilters, ...query.filters, format: 'xlsx' })
  if (query.sort) exportParams.set('sort', query.sort)

  const table = (
    <>
      {error && <Alert type="error" showIcon message={`Failed to load ${noun}: ${error}`} style={{ margin: bordered ? 16 : '0 0 16px' }} />}
      <Flex justify="space-between" align="center" gap="small" style={{ padding: bordered ? '8px 16px' : '0 0 8px' }}>
        <Flex gap="small" wrap>
          {extraFilters.map(([param, value]) => (
            <Tag key={param} closable onClose={() => removeFilter(param)} style={{ margin: 0 }}>
              {filterLabel(param, value)}
            </Tag>
          ))}
        </Flex>
        <Button size="small" type="text" icon={<DownloadOutlined />} style={{ marginLeft: 'auto', flex: 'none' }} href={`${endpoint}?${exportParams}`} disabled={result.total === 0}>
          Excel
        </Button>
      </Flex>
      <Table
        rowKey={rowKey}
        size="small"
        columns={columns.map(({ anyLabel, ...c }) => ({
          sorter: true,
          filterMultiple: false,
          sortOrder: c.dataIndex === sortCol ? (sortDesc ? 'descend' : 'ascend') : null,
          ...(c.filters
            ? { filteredValue: query.filters[c.dataIndex] ? [query.filters[c.dataIndex]] : null }
            : columnFilter(c, query.filters, setColumnFilter)),
          ...c,
        }))}
        dataSource={result.data}
        loading={loading}
        scroll={{ x: 'max-content' }}
        onChange={onChange}
        summary={
          result.sums && result.total > 0
            ? () => (
                <Table.Summary.Row style={{ fontWeight: 600 }}>
                  {columns.map((c, i) => (
                    <Table.Summary.Cell key={c.dataIndex} index={i} align={c.align}>
                      {c.dataIndex in result.sums
                        ? (c.render ?? String)(result.sums[c.dataIndex], {})
                        : i === 0 && `Total, ${result.total.toLocaleString('en-US')} ${noun}`}
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              )
            : undefined
        }
        // An embedded table whose rows all fit on its first page needs no pager.
        pagination={
          !urlState && result.total <= pageSize
            ? false
            : {
                current: query.page,
                pageSize: query.pageSize,
                total: result.total,
                showSizeChanger: true,
                showTotal: (total) => `${total} ${noun}`,
                style: bordered ? { padding: '0 16px' } : undefined,
              }
        }
      />
    </>
  )

  return bordered ? <Card styles={{ body: { padding: 0, overflow: 'hidden' } }}>{table}</Card> : table
}
