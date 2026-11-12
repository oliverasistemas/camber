import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'
import Contracts from './Contracts.jsx'
import Assets from './Assets.jsx'
import Transactions from './Transactions.jsx'
import ContractDetail from './ContractDetail.jsx'
import AssetDetail from './AssetDetail.jsx'
import AssetsByVin from './AssetsByVin.jsx'

const pages = [
  { key: 'contracts', title: 'Contracts', element: <Contracts /> },
  { key: 'assets', title: 'Assets', element: <Assets /> },
  { key: 'transactions', title: 'Transactions', element: <Transactions /> },
]

// Each page is its own route (/vervent/contracts, /vervent/assets, /vervent/transactions),
// reached from the sidebar, so it can be linked to and survives a reload. Contracts and assets
// also have detail routes: /vervent/contracts/:leaseNo, /vervent/assets/:assetNo and
// /vervent/assets/vin/:vin (the target of Copart VIN links).
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
      <Route path="contracts/:leaseNo" element={<ContractDetail />} />
      <Route path="assets/vin/:vin" element={<AssetsByVin />} />
      <Route path="assets/:assetNo" element={<AssetDetail />} />
      <Route path="*" element={<Navigate to="contracts" replace />} />
    </Routes>
  )
}
