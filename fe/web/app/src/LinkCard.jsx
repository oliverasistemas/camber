import { Card } from 'antd'
import { Link } from 'react-router-dom'

// LinkCard: a card whose whole surface links to the list behind its figure. Every figure on a
// dashboard drills down this way: card -> filtered list (filters in the query string) -> record.
export default function LinkCard({ to, children, ...props }) {
  return (
    <Link to={to} style={{ display: 'block', height: '100%' }}>
      <Card hoverable style={{ height: '100%' }} {...props}>
        {children}
      </Card>
    </Link>
  )
}
