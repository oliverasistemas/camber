import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import Contracts from './Contracts.jsx'
import Assets from './Assets.jsx'
import Transactions from './Transactions.jsx'
import ContractDetail from './ContractDetail.jsx'
import LeaseDetail from './LeaseDetail.jsx'
import AssetDetail from './AssetDetail.jsx'
import AssetsByVin from './AssetsByVin.jsx'
import TransactionDetail from './TransactionDetail.jsx'

const pages = [
  { key: 'contracts', title: 'Contracts', element: <Contracts /> },
  { key: 'assets', title: 'Assets', element: <Assets /> },
  { key: 'transactions', title: 'Transactions', element: <Transactions /> },
]

// Each page is its own route (/vervent/contracts, /vervent/assets, /vervent/transactions),
// reached from the sidebar, so it can be linked to and survives a reload.
// /vervent/contracts/history was the daily history of every contract; the daily portfolio
// snapshots replaced it, so the old address opens them.
// Every record has a detail route: /vervent/contracts/:leaseNo, /vervent/assets/:assetNo,
// /vervent/transactions/:key and /vervent/assets/vin/:vin (the target of Copart VIN links).
// /vervent/leases/:leaseId is a lease under its Camber lease id: its contracts taken together.
export default function Vervent() {
  return (
    <Routes>
      <Route index element={<Navigate to="contracts" replace />} />
      {pages.map(({ key, title, element }) => (
        <Route
          key={key}
          path={key}
          element={
            <>
              <PageHeader title={title} subtitle="Vervent portfolio 50" />
              {element}
            </>
          }
        />
      ))}
      <Route path="contracts/history" element={<Navigate to="/portfolio/snapshots?kind=daily" replace />} />
      <Route path="contracts/:leaseNo" element={<ContractDetail />} />
      <Route path="leases/:leaseId" element={<LeaseDetail />} />
      <Route path="assets/vin/:vin" element={<AssetsByVin />} />
      <Route path="assets/:assetNo" element={<AssetDetail />} />
      <Route path="transactions/:key" element={<TransactionDetail />} />
      <Route path="*" element={<Navigate to="contracts" replace />} />
    </Routes>
  )
}
