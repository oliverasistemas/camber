import { Alert, Button, Card, Flex, Typography } from 'antd'
import { GoogleOutlined } from '@ant-design/icons'

export default function Login() {
  const error = new URLSearchParams(window.location.search).get('error')

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100vh' }}>
      <Card style={{ width: 360 }}>
        <Flex vertical gap="middle">
          <Typography.Title level={3} style={{ margin: 0 }}>
            Sign in
          </Typography.Title>
          {error && <Alert type="error" message={`Sign in failed: ${error}`} />}
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
