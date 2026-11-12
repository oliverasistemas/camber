import { Flex, Typography } from 'antd'

export default function Logo({ collapsed }) {
  return (
    <Flex align="center" gap={10}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: '#2a78d6',
          color: '#fff',
          fontWeight: 700,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        C
      </div>
      {!collapsed && (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          Camber Credit
        </Typography.Text>
      )}
    </Flex>
  )
}
