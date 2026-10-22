import { useRef, useState } from 'react'
import { Button, Checkbox, Empty, Flex, Input, Popover, type InputRef } from 'antd'
import { SettingOutlined } from '@ant-design/icons'

export interface ColumnOption {
  key: string
  label: string
}

interface ColumnPickerProps {
  options: ColumnOption[]
  visibleKeys: string[]
  onChange: (keys: string[]) => void
  /** When given, a "Reset" button restores the table's default columns. */
  onReset?: () => void
  isDefault?: boolean
}

/** Toggles table columns. Long lists get a search box; "Show all" and "Hide all" act on what is listed. */
export function ColumnPicker({ options, visibleKeys, onChange, onReset, isDefault }: ColumnPickerProps) {
  const [q, setQ] = useState('')
  const searchRef = useRef<InputRef>(null)
  const searchable = options.length > 12
  const needle = q.trim().toLowerCase()
  // Alphabetical in the picker only; the table keeps the report's own column order.
  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }))
  const listed = needle ? sorted.filter((o) => o.label.toLowerCase().includes(needle)) : sorted
  const listedKeys = listed.map((o) => o.key)
  const shownCount = options.filter((o) => visibleKeys.includes(o.key)).length

  const toggle = (key: string, checked: boolean) =>
    onChange(checked ? [...visibleKeys, key] : visibleKeys.filter((k) => k !== key))

  const content = (
    <Flex vertical gap={10} className="column-picker">
      {searchable && (
        <Input.Search
          placeholder={`Search ${options.length} columns`}
          allowClear
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search columns"
        />
      )}
      <Flex vertical gap={8} className="column-picker-list">
        {listed.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No column matches "${q}"`} />
        ) : (
          listed.map((opt) => (
            <Checkbox key={opt.key} checked={visibleKeys.includes(opt.key)} onChange={(e) => toggle(opt.key, e.target.checked)}>
              {opt.label}
            </Checkbox>
          ))
        )}
      </Flex>
      {(searchable || onReset) && (
        <Flex gap={8} justify="flex-end">
          {onReset && (
            <Button size="small" type="link" disabled={isDefault} onClick={onReset} style={{ marginRight: 'auto', paddingInline: 0 }}>
              Reset
            </Button>
          )}
          {searchable && (
            <>
              <Button size="small" disabled={listed.length === 0} onClick={() => onChange(visibleKeys.filter((k) => !listedKeys.includes(k)))}>
                Hide all
              </Button>
              <Button
                size="small"
                disabled={listed.length === 0}
                onClick={() => onChange([...visibleKeys, ...listedKeys.filter((k) => !visibleKeys.includes(k))])}
              >
                Show all
              </Button>
            </>
          )}
        </Flex>
      )}
    </Flex>
  )

  return (
    <Popover content={content} trigger="click" placement="bottomLeft" title="Visible columns" onOpenChange={(o) => (o ? setTimeout(() => searchRef.current?.focus(), 60) : setQ(''))}>
      <Button icon={<SettingOutlined />}>{shownCount < options.length ? `Columns (${shownCount} of ${options.length})` : 'Columns'}</Button>
    </Popover>
  )
}
