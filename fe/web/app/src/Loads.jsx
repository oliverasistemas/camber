import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import LoadFiles from './LoadFiles.jsx'
import LoadRuns from './LoadRuns.jsx'
import LoadFileDetail from './LoadFileDetail.jsx'
import LoadRunDetail from './LoadRunDetail.jsx'

const pages = [
  {
    key: 'files',
    title: 'Loaded Files',
    subtitle: 'Every vendor file a loader attempted, newest first',
    element: <LoadFiles />,
  },
  {
    key: 'runs',
    title: 'Load Runs',
    subtitle: 'Every loader invocation; a run loads one or more files',
    element: <LoadRuns />,
  },
]

// The load history (load_runs / load_files): /loads/files and /loads/runs from the sidebar, with a
// detail route per record, /loads/files/:id and /loads/runs/:id. /loads opens the files.
export default function Loads() {
  return (
    <Routes>
      <Route index element={<Navigate to="files" replace />} />
      {pages.map(({ key, title, subtitle, element }) => (
        <Route
          key={key}
          path={key}
          element={
            <>
              <PageHeader title={title} subtitle={subtitle} />
              {element}
            </>
          }
        />
      ))}
      <Route path="files/:id" element={<LoadFileDetail />} />
      <Route path="runs/:id" element={<LoadRunDetail />} />
      <Route path="*" element={<Navigate to="files" replace />} />
    </Routes>
  )
}
