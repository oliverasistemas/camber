import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Avatar, Button, Dropdown, Flex, Grid, Layout, Spin, Typography } from 'antd'
import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import Login from './Login.jsx'
import Sidebar from './Sidebar.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import Dashboard from './Dashboard.jsx'
import Vervent from './Vervent.jsx'
import Copart from './Copart.jsx'
import Loads from './Loads.jsx'

export default function App() {
  const [user, setUser] = useState(undefined)
  const [collapsed, setCollapsed] = useState(false)
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} />
      <Layout>
        <Layout.Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
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
          <GlobalSearch />
          <div style={{ flex: 1 }} />
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
            <Route path="/copart/*" element={<Copart />} />
            <Route path="/loads/*" element={<Loads />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
