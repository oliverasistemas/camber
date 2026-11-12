import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Dropdown, Flex, Grid, Layout, Menu, Spin, Typography } from 'antd'
import {
  CarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import Logo from './Logo.jsx'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Vervent from './Vervent.jsx'
import Copart from './Copart.jsx'

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
  { key: '/copart', icon: <CarOutlined />, label: 'Copart' },
]

const leaves = sections.flatMap((s) => s.children ?? [s])

export default function App() {
  const [user, setUser] = useState(undefined)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const screens = Grid.useBreakpoint()

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  // Collapse the sidebar to icons on narrow screens.
  useEffect(() => {
    if (screens.lg !== undefined) setCollapsed(!screens.lg)
  }, [screens.lg])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  if (user === undefined) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (!user) return <Login />

  const current = leaves.find((s) => pathname.startsWith(s.key))?.key

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
          defaultOpenKeys={['/vervent']}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 0, marginTop: 8 }}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #eceef1',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'email', label: user.email, disabled: true },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: 'Log out', onClick: logout },
              ],
            }}
          >
            <Button type="text" style={{ height: 40, paddingInline: 8 }}>
              <Flex align="center" gap={8}>
                <Avatar size={28} src={user.picture || undefined}>
                  {user.name?.[0]}
                </Avatar>
                {screens.sm && <span>{user.name}</span>}
              </Flex>
            </Button>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ padding: screens.md ? 24 : 16 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/vervent/*" element={<Vervent />} />
            <Route path="/copart" element={<Copart />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
