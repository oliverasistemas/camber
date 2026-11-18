import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import { CarOutlined, DashboardOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons'
import Logo from './Logo.jsx'

const sections = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  {
    key: '/vervent',
    icon: <FileTextOutlined />,
    label: 'Vervent',
    children: [
      { key: '/vervent/contracts', label: 'Contracts' },
      { key: '/vervent/assets', label: 'Assets' },
      { key: '/vervent/transactions', label: 'Transactions' },
    ],
  },
  {
    key: '/copart',
    icon: <CarOutlined />,
    label: 'Copart',
    children: [
      { key: '/copart/inventory', label: 'Inventory' },
      { key: '/copart/sales', label: 'Sales' },
      { key: '/copart/vs-vervent', label: 'Vs Vervent' },
    ],
  },
  {
    key: '/loads',
    icon: <HistoryOutlined />,
    label: 'Loads',
    children: [
      { key: '/loads/files', label: 'Files' },
      { key: '/loads/runs', label: 'Runs' },
    ],
  },
]

const leaves = sections.flatMap((s) => s.children ?? [s])

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const current = leaves.find((s) => pathname.startsWith(s.key))?.key

  return (
    <Layout.Sider
      collapsible
      collapsed={collapsed}
      trigger={null}
      width={224}
      collapsedWidth={64}
      style={{
        borderRight: '1px solid #eceef1',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 18px' }}>
        <Logo collapsed={collapsed} />
      </div>
      <Menu
        mode="inline"
        items={sections}
        selectedKeys={current ? [current] : []}
        defaultOpenKeys={['/vervent', '/copart', '/loads']}
        onClick={({ key }) => navigate(key)}
        style={{ borderInlineEnd: 0, marginTop: 8 }}
      />
    </Layout.Sider>
  )
}
