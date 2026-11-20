import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import Snapshots, { TakeSnapshot } from './Snapshots.jsx'
import SnapshotDetail from './SnapshotDetail.jsx'
import SnapshotContract from './SnapshotContract.jsx'

// Portfolio pages read the portfolio snapshots, which are servicer-neutral. /portfolio/snapshots is
// the list, from the sidebar; a snapshot is /portfolio/snapshots/:id and one contract in it
// /portfolio/snapshots/:id/contracts/:contractNo. /portfolio opens the list.
export default function Portfolio() {
  return (
    <Routes>
      <Route index element={<Navigate to="snapshots" replace />} />
      <Route
        path="snapshots"
        element={
          <>
            <PageHeader
              title="Portfolio snapshots"
              subtitle="Frozen copies of the portfolio: one for every daily servicer file, and the ones taken on demand"
              extra={<TakeSnapshot />}
            />
            <Snapshots />
          </>
        }
      />
      <Route path="snapshots/:id" element={<SnapshotDetail />} />
      <Route path="snapshots/:id/contracts/:contractNo" element={<SnapshotContract />} />
      <Route path="*" element={<Navigate to="snapshots" replace />} />
    </Routes>
  )
}
