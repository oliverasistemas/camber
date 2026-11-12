import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import CopartInventory from './CopartInventory.jsx'
import CopartSales from './CopartSales.jsx'

const pages = [
  {
    key: 'inventory',
    title: 'Inventory',
    subtitle: 'Vehicles at Copart, from the weekly seller report',
    element: <CopartInventory />,
  },
  { key: 'sales', title: 'Sales', subtitle: 'Copart auction sales and proceeds', element: <CopartSales /> },
]

// Each page is its own route (/copart/inventory, /copart/sales), reached from the sidebar, so it
// can be linked to and survives a reload. /copart opens the inventory.
export default function Copart() {
  return (
    <Routes>
      <Route index element={<Navigate to="inventory" replace />} />
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
      <Route path="*" element={<Navigate to="inventory" replace />} />
    </Routes>
  )
}
