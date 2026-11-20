import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

// useRecord fetches one row from an /api/{vervent,copart,servicing}/<table>/{id} endpoint. record is
// undefined while loading and null when the id doesn't exist.
export function useRecord(endpoint) {
  const [state, setState] = useState({ record: undefined, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ record: undefined, error: null })
    fetch(endpoint)
      .then((res) => {
        // Session expired or was invalidated: reload so App falls back to the login page.
        if (res.status === 401) window.location.reload()
        if (res.status === 404) return null
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((record) => !cancelled && setState({ record, error: null }))
      .catch((err) => !cancelled && setState({ record: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [endpoint])

  return state
}

// Cross-links between records, for table columns and detail pages.
export const contractLink = (leaseNo) => leaseNo && <Link to={`/vervent/contracts/${encodeURIComponent(leaseNo)}`}>{leaseNo}</Link>
// A lease under its Camber lease id: the main contract and its deficiency contracts together.
export const leaseLink = (leaseId) => leaseId && <Link to={`/vervent/leases/${encodeURIComponent(leaseId)}`}>{leaseId}</Link>
export const terminationLink = (leaseNo) => leaseNo && <Link to={`/servicing/terminations/${encodeURIComponent(leaseNo)}`}>{leaseNo}</Link>
export const assetLink = (assetNo, label = assetNo) => assetNo != null && <Link to={`/vervent/assets/${assetNo}`}>{label}</Link>
export const transactionLink = (key) => key != null && <Link to={`/vervent/transactions/${encodeURIComponent(key)}`}>{key}</Link>
export const loadRunLink = (id, label = id) => id != null && <Link to={`/loads/runs/${id}`}>{label}</Link>
export const loadFileLink = (id, label = id) => id != null && <Link to={`/loads/files/${id}`}>{label}</Link>
// A VIN can belong to more than one Vervent asset (a vehicle that was re-leased), so it opens a lookup.
export const vinLink = (vin) => vin && <Link to={`/vervent/assets/vin/${encodeURIComponent(vin)}`}>{vin}</Link>
