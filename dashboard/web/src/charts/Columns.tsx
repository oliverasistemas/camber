import { useState } from 'react'
import { Tooltip, TipState } from '../Tooltip'
import { useWidth } from '../useWidth'
import { niceTicks } from '../format'

export interface ColumnItem {
  label: string
  value: number
  color?: string // defaults to series slot 1
  tipTitle?: string
  tipRows: { k: string; v: string }[]
}

/** Column path: square baseline, 4px rounded data-end. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function Columns({
  items,
  height = 210,
  formatTick,
  directLabel,
  onSelect,
}: {
  items: ColumnItem[]
  height?: number
  formatTick: (v: number) => string
  /** formatted value placed on the cap of the tallest column */
  directLabel: (v: number) => string
  /** when set, columns become clickable (Enter/Space from the keyboard) */
  onSelect?: (index: number) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState(-1)
  if (items.length === 0) return <div ref={ref} style={{ height }} />

  const m = { top: 18, right: 6, bottom: 24, left: 46 }
  const w = Math.max(width, 280)
  const innerW = w - m.left - m.right
  const innerH = height - m.top - m.bottom
  const max = Math.max(...items.map((d) => d.value), 0)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] || 1
  const band = innerW / items.length
  const barW = Math.min(24, band * 0.64)
  const y = (v: number) => m.top + innerH * (1 - v / top)
  const maxIdx = items.findIndex((d) => d.value === max)
  const labelEvery = Math.ceil(items.length / 8)

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={w} height={height} role="img" aria-label="Column chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text className="axis-text" x={m.left - 7} y={y(t) + 3.5} textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line x1={m.left} x2={w - m.right} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        {items.map((d, i) => {
          const cx = m.left + band * i + band / 2
          const h = (d.value / top) * innerH
          return (
            <g key={d.label}>
              {d.value > 0 && (
                <path
                  d={columnPath(cx - barW / 2, y(d.value), barW, h)}
                  fill={d.color ?? 'var(--series-1)'}
                  opacity={hover === i ? 0.82 : 1}
                />
              )}
              {i % labelEvery === 0 && (
                <text className="axis-text" x={cx} y={height - 7} textAnchor="middle">
                  {d.label}
                </text>
              )}
              {i === maxIdx && d.value > 0 && (
                <text className="direct-label" x={cx} y={y(d.value) - 6} textAnchor="middle">
                  {directLabel(d.value)}
                </text>
              )}
            </g>
          )
        })}
        {/* hit layer: full band height, wider than the mark */}
        {items.map((d, i) => (
          <rect
            key={d.label}
            className={onSelect ? 'hit clickable' : 'hit'}
            x={m.left + band * i}
            y={m.top}
            width={band}
            height={innerH}
            tabIndex={0}
            role={onSelect ? 'button' : undefined}
            aria-label={`${d.tipTitle ?? d.label}: ${d.tipRows.map((r) => `${r.v} ${r.k}`).join(', ')}${onSelect ? '. View leases' : ''}`}
            onClick={onSelect ? () => onSelect(i) : undefined}
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(i)
                    }
                  }
                : undefined
            }
            onPointerEnter={() => {
              setHover(i)
              setTip({ x: m.left + band * i + band / 2, y: y(d.value), title: d.tipTitle ?? d.label, rows: d.tipRows })
            }}
            onFocus={() => {
              setHover(i)
              setTip({ x: m.left + band * i + band / 2, y: y(d.value), title: d.tipTitle ?? d.label, rows: d.tipRows })
            }}
            onPointerLeave={() => {
              setHover(-1)
              setTip(null)
            }}
            onBlur={() => {
              setHover(-1)
              setTip(null)
            }}
          />
        ))}
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
