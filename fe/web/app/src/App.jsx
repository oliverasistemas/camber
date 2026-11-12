import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Flex, Layout, Menu, Spin, Typography } from 'antd'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Vervent from './Vervent.jsx'
import Copart from './Copart.jsx'

const sections = [
  { key: '/dashboard', label: 'Dashboard' },
  { key: '/vervent', label: 'Vervent' },
  { key: '/copart', label: 'Copart' },
]

export default function App() {
  const [user, setUser] = useState(undefined)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

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

  const current = sections.find((s) => pathname.startsWith(s.key))?.key

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
          Camber Credit
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          items={sections}
          selectedKeys={current ? [current] : []}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Flex align="center" gap="small">
          <Avatar src={user.picture} />
          <Typography.Text style={{ color: '#fff' }}>{user.name}</Typography.Text>
          <Button onClick={logout}>Log out</Button>
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vervent/*" element={<Vervent />} />
          <Route path="/copart" element={<Copart />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
