import { useEffect, useState } from 'react'
import { Alert, Breadcrumb, Result, Spin } from 'antd'
import { Link, Navigate, useParams } from 'react-router-dom'
import DataTable from './DataTable.jsx'
import PageHeader from './PageHeader.jsx'
import { columns } from './Assets.jsx'
import { camberList } from './portfolios.jsx'

// AssetsByVin is /vervent/assets/vin/:vin, where Copart VINs link. One matching asset opens it;
// a re-leased vehicle has several, which are listed.
export default function AssetsByVin() {
  const { vin } = useParams()
  const [result, setResult] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    setResult(undefined)
    fetch(`/api/vervent/assets?${new URLSearchParams({ serial_number: vin, limit: 2 })}`)
      .then((res) => {
        if (res.status === 401) window.location.reload()
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((body) => !cancelled && setResult(body))
      .catch((err) => !cancelled && setResult({ error: err.message }))
    return () => {
      cancelled = true
    }
  }, [vin])

  if (result === undefined) return <Spin style={{ display: 'block', margin: '64px auto' }} />
  if (result.total === 1) return <Navigate to={`/vervent/assets/${result.data[0].asset_no}`} replace />

  return (
    <>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to={camberList('/vervent/assets')}>Assets</Link> }, { title: `VIN ${vin}` }]}
      />
      {result.error ? (
        <Alert type="error" showIcon message={`Failed to look up VIN ${vin}: ${result.error}`} />
      ) : result.total === 0 ? (
        <Result status="404" title={`No Vervent asset has VIN ${vin}`} />
      ) : (
        <>
          <PageHeader title={`VIN ${vin}`} subtitle="This vehicle is on more than one Vervent asset" />
          <DataTable endpoint="/api/vervent/assets" rowKey="asset_no" columns={columns} noun="assets" baseFilters={{ serial_number: vin }} />
        </>
      )}
    </>
  )
}
