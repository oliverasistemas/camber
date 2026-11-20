import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import Terminations from './Terminations.jsx'
import TerminationDetail from './TerminationDetail.jsx'

// Servicing pages combine Vervent and Copart data per lease. /servicing/terminations is the lease
// termination tracker, from the sidebar, with a detail route per lease,
// /servicing/terminations/:leaseNo. /servicing opens the tracker.
export default function Servicing() {
  return (
    <Routes>
      <Route index element={<Navigate to="terminations" replace />} />
      <Route
        path="terminations"
        element={
          <>
            <PageHeader
              title="Lease terminations"
              subtitle="Every vehicle lease with its Vervent status and its Copart lot and sale"
            />
            <Terminations />
          </>
        }
      />
      <Route path="terminations/:leaseNo" element={<TerminationDetail />} />
      <Route path="*" element={<Navigate to="terminations" replace />} />
    </Routes>
  )
}
