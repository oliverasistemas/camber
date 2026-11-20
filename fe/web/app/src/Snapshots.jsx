import { useState } from 'react'
import { CameraOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, Modal, Tag } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import DataTable, { dateTime, money } from './DataTable.jsx'

export const snapshotPath = (id) => `/portfolio/snapshots/${id}`
export const kindTag = (v) => v && <Tag color={v === 'manual' ? 'blue' : 'default'}>{v}</Tag>
export const count = (v) => v?.toLocaleString('en-US')
// rate is delinquent contracts as a percentage of active ones, as the dashboard shows it.
export const rate = (s) => (s.active_contracts > 0 ? `${((s.delinquent_contracts / s.active_contracts) * 100).toFixed(2)}%` : '')
// title names a snapshot: a manual one by its name, a daily one by its date.
export const title = (s) => s.name ?? `Daily snapshot, ${s.as_of}`

// One row per snapshot (portfolio_snapshots) with the totals frozen when it was taken. Filtered to
// kind=daily this is the portfolio by day: the table behind the dashboard's trend charts. Each
// row links to the snapshot, which lists the contract rows its totals are the sums of.
const columns = [
  { title: 'As of', dataIndex: 'as_of', fixed: 'left', render: (v, s) => <Link to={snapshotPath(s.id)}>{v}</Link> },
  {
    title: 'Kind',
    dataIndex: 'kind',
    filters: [
      { text: 'Daily', value: 'daily' },
      { text: 'Manual', value: 'manual' },
    ],
    render: kindTag,
  },
  { title: 'Name', dataIndex: 'name', render: (v, s) => v && <Link to={snapshotPath(s.id)}>{v}</Link> },
  { title: 'Outstanding Receivables', dataIndex: 'outstanding_receivables', align: 'right', render: money },
  { title: 'Active', dataIndex: 'active_contracts', align: 'right', render: count },
  { title: 'Contracts', dataIndex: 'total_contracts', align: 'right', render: count },
  { title: 'Past Due', dataIndex: 'past_due', align: 'right', render: money },
  { title: 'Delinquent', dataIndex: 'delinquent_contracts', align: 'right', render: count },
  // Derived from the two counts, so the server can't sort on it.
  { title: 'Delinquency Rate', key: 'delinquency_rate', align: 'right', sorter: false, render: (_, s) => rate(s) },
  { title: 'Servicer', dataIndex: 'servicer' },
  { title: 'Taken', dataIndex: 'taken_at', render: dateTime },
  { title: 'By', dataIndex: 'taken_by' },
]

// TakeSnapshot: the button and dialog that freeze the contracts as loaded now into a named
// snapshot (POST /api/snapshots), then open it.
export function TakeSnapshot() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  const submit = async ({ name, note }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, note: note ?? '' }),
      })
      if (res.status === 401) return window.location.reload()
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText)
      navigate(snapshotPath((await res.json()).id))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="primary" icon={<CameraOutlined />} onClick={() => setOpen(true)}>
        Take snapshot
      </Button>
      <Modal
        title="Take a portfolio snapshot"
        open={open}
        okText="Take snapshot"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <p>
          Copies every contract as it is loaded right now, with its totals. The copy is kept as it is: later
          servicer files don't change it.
        </p>
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Give the snapshot a name' }]}>
            <Input maxLength={200} placeholder="October month-end" autoFocus />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea maxLength={2000} rows={3} placeholder="What this snapshot is for (optional)" />
          </Form.Item>
        </Form>
        {error && <Alert type="error" showIcon message={`Couldn't take the snapshot: ${error}`} />}
      </Modal>
    </>
  )
}

export default function Snapshots() {
  return <DataTable endpoint="/api/snapshots" rowKey="id" columns={columns} noun="snapshots" urlState />
}
