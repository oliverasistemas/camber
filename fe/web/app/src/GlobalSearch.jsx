import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutoComplete, Flex, Input, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const MIN_LENGTH = 2 // searchMinLength in be/rest/search.go

// One result row: the matched identifier on the left, what it belongs to on the right.
const option = (to, id, detail) => ({
  value: to,
  label: (
    <Flex justify="space-between" gap="middle">
      <span>{id}</span>
      <Typography.Text type="secondary" ellipsis>
        {detail}
      </Typography.Text>
    </Flex>
  ),
})

// toOptions groups /api/search results; each option's value is the route it opens.
const toOptions = (r) =>
  [
    {
      label: 'Contracts',
      options: r.contracts.map((c) =>
        option(`/vervent/contracts/${encodeURIComponent(c.lease_no)}`, c.lease_no, c.lessee_name),
      ),
    },
    {
      label: 'Assets',
      options: r.assets.map((a) => option(`/vervent/assets/${a.asset_no}`, a.serial_number, a.description)),
    },
    {
      label: 'Copart lots',
      options: r.lots.map((l) =>
        option(
          `/copart/inventory?${new URLSearchParams({ lot_nbr: l.lot_nbr })}`,
          l.vin,
          `Lot ${l.lot_nbr} · ${[l.year, l.make, l.model].filter(Boolean).join(' ')}`,
        ),
      ),
    },
  ].filter((g) => g.options.length)

// GlobalSearch is the header search box: type part of a lease number or VIN and pick a contract,
// asset or Copart lot to open it. Enter opens the first result.
export default function GlobalSearch() {
  const [text, setText] = useState('')
  const [options, setOptions] = useState([])
  const [searched, setSearched] = useState(false)
  const navigate = useNavigate()
  const q = text.trim()

  useEffect(() => {
    setSearched(false)
    if (q.length < MIN_LENGTH) {
      setOptions([])
      return
    }
    let cancelled = false
    // Wait for a pause in typing before asking the server.
    const timer = setTimeout(() => {
      fetch(`/api/search?${new URLSearchParams({ q })}`)
        .then((res) => {
          if (res.status === 401) window.location.reload()
          return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
        })
        .then((body) => {
          if (cancelled) return
          setOptions(toOptions(body))
          setSearched(true)
        })
        .catch(() => !cancelled && setOptions([]))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q])

  return (
    <AutoComplete
      value={text}
      options={options}
      onChange={setText}
      onSelect={(to) => {
        setText('')
        navigate(to)
      }}
      defaultActiveFirstOption
      notFoundContent={searched ? 'No contract or VIN matches' : null}
      popupMatchSelectWidth={420}
      style={{ flex: 1, maxWidth: 420 }}
    >
      <Input prefix={<SearchOutlined />} placeholder="Search contract or VIN" allowClear aria-label="Search contract or VIN" />
    </AutoComplete>
  )
}
