import { useEffect, useRef, useState } from 'react'
import { Button, DatePicker, Flex, Input, InputNumber } from 'antd'
import dayjs from 'dayjs'

// The filter a column gets when it has no list of values to pick from (`filters`): a date range,
// a number range or a text search. Each writes the list contract's own parameters for its column
// (transaction_date_key.gte, days_del.lte, lessee_name.like), so a filtered table can be linked to.

// filterKind picks the control from the column: `filter` if it says ('date', 'number', 'text' or
// false for none), else by its name and alignment, since tables right-align their numbers.
export const filterKind = (c) => {
  if (c.filter !== undefined) return c.filter
  if (!c.dataIndex) return false
  if (/(^|_)date(_|$)|^as_of$|_at$/.test(c.dataIndex)) return 'date'
  return c.align === 'right' ? 'number' : 'text'
}

// A timestamp column (finished_at) is bounded by the start of the day after the range, where a
// date column takes the last day itself.
const isTimestamp = (col) => col.endsWith('_at')
const iso = (d) => d.format('YYYY-MM-DD')

const presets = () => [
  { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
  { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
]

// useFocus focuses the control's first input once its dropdown has opened; autoFocus fires while
// the dropdown is still hidden and is lost.
function useFocus() {
  const ref = useRef(null)
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])
  return ref
}

function Panel({ children, onApply, onReset }) {
  return (
    <Flex vertical gap="small" style={{ padding: 8, width: 260 }} onKeyDown={(e) => e.stopPropagation()}>
      {children}
      <Flex justify="space-between">
        <Button size="small" type="link" onClick={onReset}>
          Reset
        </Button>
        {onApply && (
          <Button size="small" type="primary" onClick={onApply}>
            Apply
          </Button>
        )}
      </Flex>
    </Flex>
  )
}

function TextFilter({ col, current, apply }) {
  const [value, setValue] = useState(current[`${col}.like`] ?? '')
  const submit = () => apply(value.trim() ? { [`${col}.like`]: value.trim() } : {})
  const input = useFocus()
  return (
    <Panel onApply={submit} onReset={() => apply({})}>
      <Input ref={input} allowClear placeholder="Contains" value={value} onChange={(e) => setValue(e.target.value)} onPressEnter={submit} />
    </Panel>
  )
}

function NumberFilter({ col, current, apply }) {
  const [min, setMin] = useState(current[`${col}.gte`] ?? null)
  const [max, setMax] = useState(current[`${col}.lte`] ?? null)
  const input = useFocus()
  const submit = () =>
    apply({
      ...(min !== null && min !== '' && { [`${col}.gte`]: String(min) }),
      ...(max !== null && max !== '' && { [`${col}.lte`]: String(max) }),
    })
  return (
    <Panel onApply={submit} onReset={() => apply({})}>
      <Flex gap="small">
        <InputNumber ref={input} placeholder="Min" value={min} onChange={setMin} onPressEnter={submit} style={{ flex: 1 }} />
        <InputNumber placeholder="Max" value={max} onChange={setMax} onPressEnter={submit} style={{ flex: 1 }} />
      </Flex>
    </Panel>
  )
}

function DateFilter({ col, current, apply }) {
  const from = current[`${col}.gte`]
  // A timestamp column's upper bound is the day after the last day shown.
  const to = current[`${col}.lte`] ?? (current[`${col}.lt`] && iso(dayjs(current[`${col}.lt`]).subtract(1, 'day')))
  const submit = (range) => {
    if (!range?.[0] || !range?.[1]) return apply({})
    const upper = isTimestamp(col) ? { [`${col}.lt`]: iso(range[1].add(1, 'day')) } : { [`${col}.lte`]: iso(range[1]) }
    apply({ [`${col}.gte`]: iso(range[0]), ...upper })
  }
  return (
    <Panel onReset={() => apply({})}>
      <DatePicker.RangePicker
        presets={presets()}
        value={from && to ? [dayjs(from), dayjs(to)] : null}
        onChange={submit}
      />
    </Panel>
  )
}

const controls = { text: TextFilter, number: NumberFilter, date: DateFilter }

// columnFilter returns the antd column props for c's filter, or nothing if it gets none.
// current is the table's filters; apply(params) replaces the column's filters with params.
export function columnFilter(c, current, apply) {
  const Control = controls[filterKind(c)]
  if (!Control) return {}
  const col = c.dataIndex
  const own = Object.keys(current).filter((k) => k === col || k.startsWith(`${col}.`))
  return {
    filtered: own.length > 0,
    // Mounted while open only, so each opening starts from the filters as they are now.
    filterDropdown: ({ close, visible }) =>
      visible && (
        <Control
          col={col}
          current={current}
          apply={(params) => {
            apply(col, params)
            close()
          }}
        />
      ),
  }
}
