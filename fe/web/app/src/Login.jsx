import { Alert, Button, Card, Flex, Typography } from 'antd'
import { GoogleOutlined } from '@ant-design/icons'
import Logo from './Logo.jsx'

const errors = { access_denied: 'This Google account is not allowed to sign in.' }

export default function Login() {
  const error = new URLSearchParams(window.location.search).get('error')

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh', padding: 16, background: '#f5f6f8' }}>
      <Card style={{ width: 380, maxWidth: '100%' }} styles={{ body: { padding: 32 } }}>
        <Flex vertical gap="large">
          <Logo />
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Sign in
            </Typography.Title>
            <Typography.Text type="secondary">Use your Camber Credit Google account.</Typography.Text>
          </div>
          {error && <Alert type="error" showIcon message={errors[error] ?? `Sign in failed: ${error}`} />}
          <Button
            type="primary"
            size="large"
            icon={<GoogleOutlined />}
            href="/api/auth/google/login"
            block
          >
            Sign in with Google
          </Button>
        </Flex>
      </Card>
    </Flex>
  )
}
