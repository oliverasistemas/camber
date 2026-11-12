import { Card, Empty } from 'antd'
import PageHeader from './PageHeader.jsx'

export default function Copart() {
  return (
    <>
      <PageHeader title="Copart" subtitle="Auction sales and proceeds" />
      <Card>
        <Empty description="Copart data isn't available here yet." style={{ padding: '48px 0' }} />
      </Card>
    </>
  )
}
