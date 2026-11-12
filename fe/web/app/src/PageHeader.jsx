import { Flex, Typography } from 'antd'

// PageHeader: the title row every page starts with, an optional one-line subtitle and actions on the right.
export default function PageHeader({ title, subtitle, extra }) {
  return (
    <Flex justify="space-between" align="flex-end" gap="middle" wrap style={{ marginBottom: 20 }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra}
    </Flex>
  )
}
