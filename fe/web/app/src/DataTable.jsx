import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Card, Flex, Table, Tag } from 'antd'

export const money = (v) =>
  v == null ? '' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Filter parameters can carry a comparison suffix (days_del.gt=0); see filterOps in be/rest/vervent.go.
const opSymbols = { gt: '>', gte: '≥', lt: '<', lte: '≤', ne: '≠' }

// Query string parameters that are not column filters.
const reserved = ['page', 'limit', 'sort']

// useTableQuery holds the page, sort and filters. With urlState they live in the query string,
// spelled like the API's own parameters (?status=NLSE&days_del.gt=0&sort=-days_del&page=2), so a
// filtered list can be linked to; otherwise they are local state.
function useTableQuery(urlState, pageSize) {
  const local = useState({ page: 1, pageSize, filters: {}, sort: null })
  const [params, setParams] = useSearchParams()
  if (!urlState) return local

  const query = {
    page: Number(params.get('page')) || 1,
    pageSize: Number(params.get('limit')) || pageSize,
    filters: Object.fromEntries([...params].filter(([k]) => !reserved.includes(k))),
    sort: params.get('sort'),
  }
  const setQuery = (q) => {
    const next = new URLSearchParams(q.filters)
    if (q.sort) next.set('sort', q.sort)
    if (q.page > 1) next.set('page', q.page)
    if (q.pageSize !== pageSize) next.set('limit', q.pageSize)
    setParams(next)
  }
  return [query, setQuery]
}

// DataTable shows one /api/vervent/* or /api/copart/* list with server-side paging, sorting and filtering.
// Every column is sortable; a column with `filters` filters on its dataIndex by exact match.
// baseFilters are fixed column filters always sent, e.g. { lease: '5000080213' }.
// urlState keeps the page, sort and filters in the query string: for the one main table of a list
// page, not for tables embedded in a detail page. Filters the columns have no control for (a
// dashboard drill-down such as days_del.gt=0) show as removable tags above the table.
// bordered wraps the table in a card; the contract drawer turns it off.
export default function DataTable({ endpoint, rowKey, columns, noun, baseFilters, pageSize = 20, bordered = true, urlState = false }) {
  const [query, setQuery] = useTableQuery(urlState, pageSize)
  const [result, setResult] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const baseKey = JSON.stringify(baseFilters ?? {})
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
  }, [endpoint, baseKey, queryKey])

  // Filters with a column control belong to the table; the rest are shown as tags.
  const controlled = new Set(columns.filter((c) => c.filters).map((c) => c.dataIndex))
  const extraFilters = Object.entries(query.filters).filter(([k]) => !controlled.has(k))
  const [sortCol, sortDesc] = query.sort?.startsWith('-') ? [query.sort.slice(1), true] : [query.sort, false]

  const filterLabel = (param, value) => {
    const [col, op] = param.split('.')
    const title = columns.find((c) => c.dataIndex === col)?.title ?? col.replaceAll('_', ' ')
    return `${title} ${opSymbols[op] ?? '='} ${value}`
  }

  const onChange = (pagination, tableFilters, sorter) => {
    const filters = {
      ...Object.fromEntries(extraFilters),
      ...Object.fromEntries(
        Object.entries(tableFilters)
          .filter(([, v]) => v?.length)
          .map(([col, v]) => [col, v[0]]),
      ),
    }
    const sort = sorter.order ? `${sorter.order === 'descend' ? '-' : ''}${sorter.field}` : null
    const reset = JSON.stringify(filters) !== JSON.stringify(query.filters) || sort !== query.sort
    setQuery({ page: reset ? 1 : pagination.current, pageSize: pagination.pageSize, filters, sort })
  }

  const removeFilter = (param) => {
    const { [param]: _, ...filters } = query.filters
    setQuery({ ...query, page: 1, filters })
  }

  const table = (
    <>
      {error && <Alert type="error" showIcon message={`Failed to load ${noun}: ${error}`} style={{ margin: bordered ? 16 : '0 0 16px' }} />}
      {extraFilters.length > 0 && (
        <Flex gap="small" wrap style={{ padding: bordered ? '12px 16px' : '0 0 12px' }}>
          {extraFilters.map(([param, value]) => (
            <Tag key={param} closable onClose={() => removeFilter(param)} style={{ margin: 0 }}>
              {filterLabel(param, value)}
            </Tag>
          ))}
        </Flex>
      )}
      <Table
        rowKey={rowKey}
        size="small"
        columns={columns.map((c) => ({
          sorter: true,
          filterMultiple: false,
          sortOrder: c.dataIndex === sortCol ? (sortDesc ? 'descend' : 'ascend') : null,
          ...(c.filters && { filteredValue: query.filters[c.dataIndex] ? [query.filters[c.dataIndex]] : null }),
          ...c,
        }))}
        dataSource={result.data}
        loading={loading}
        scroll={{ x: 'max-content' }}
        onChange={onChange}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: result.total,
          showSizeChanger: true,
          showTotal: (total) => `${total} ${noun}`,
          style: bordered ? { padding: '0 16px' } : undefined,
        }}
      />
    </>
  )

  return bordered ? <Card styles={{ body: { padding: 0, overflow: 'hidden' } }}>{table}</Card> : table
}
