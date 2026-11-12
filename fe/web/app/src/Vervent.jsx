import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Tabs, Typography } from 'antd'
import Contracts from './Contracts.jsx'
import Assets from './Assets.jsx'
import Transactions from './Transactions.jsx'

const tabs = [
  { key: 'contracts', label: 'Contracts', element: <Contracts /> },
  { key: 'assets', label: 'Assets', element: <Assets /> },
  { key: 'transactions', label: 'Transactions', element: <Transactions /> },
]

// Each tab is its own route (/vervent/contracts, /vervent/assets, /vervent/transactions)
// so it can be linked to and survives a reload.
export default function Vervent() {
  const navigate = useNavigate()
  const active = useLocation().pathname.split('/')[2]

  return (
    <>
      <Typography.Title level={3}>Vervent</Typography.Title>
      <Tabs
        activeKey={active}
        items={tabs.map(({ key, label }) => ({ key, label }))}
        onChange={(key) => navigate(`/vervent/${key}`)}
      />
      <Routes>
        <Route index element={<Navigate to="contracts" replace />} />
        {tabs.map(({ key, element }) => (
          <Route key={key} path={key} element={element} />
        ))}
        <Route path="*" element={<Navigate to="contracts" replace />} />
      </Routes>
    </>
  )
}
