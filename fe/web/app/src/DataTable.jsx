import { useEffect, useState } from 'react'
import { Alert, Table } from 'antd'

export const money = (v) =>
  v == null ? '' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// DataTable shows one /api/vervent/* list with server-side paging, sorting and filtering.
// Every column is sortable; a column with `filters` filters on its dataIndex by exact match.
// baseFilters are fixed column filters always sent, e.g. { lease: '5000080213' }.
export default function DataTable({ endpoint, rowKey, columns, noun, baseFilters, pageSize = 20 }) {
  const [query, setQuery] = useState({ page: 1, pageSize, filters: {}, sort: null })
  const [result, setResult] = useState({ data: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const baseKey = JSON.stringify(baseFilters ?? {})

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
  }, [endpoint, baseKey, query])

  const onChange = (pagination, tableFilters, sorter) => {
    const filters = Object.fromEntries(
      Object.entries(tableFilters)
        .filter(([, v]) => v?.length)
        .map(([col, v]) => [col, v[0]]),
    )
    const sort = sorter.order ? `${sorter.order === 'descend' ? '-' : ''}${sorter.field}` : null
    const reset = JSON.stringify(filters) !== JSON.stringify(query.filters) || sort !== query.sort
    setQuery({ page: reset ? 1 : pagination.current, pageSize: pagination.pageSize, filters, sort })
  }

  return (
    <>
      {error && <Alert type="error" message={`Failed to load ${noun}: ${error}`} />}
      <Table
        rowKey={rowKey}
        size="small"
        columns={columns.map((c) => ({ sorter: true, filterMultiple: false, ...c }))}
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
        }}
      />
    </>
  )
}
