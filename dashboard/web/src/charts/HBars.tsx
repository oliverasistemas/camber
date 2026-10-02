import { moneyFull, int } from '../format'

export interface HBarItem {
  label: string
  value: number
  note?: string // shown after the value, muted
}

/**
 * Horizontal bar list for long-named categories: label on its own line,
 * bar with the value at its tip (every value is directly labeled, so no
 * tooltip layer is needed — the table twin still carries the full numbers).
 */
export function HBars({ items, format = int }: { items: HBarItem[]; format?: (v: number) => string }) {
  const max = Math.max(...items.map((d) => d.value), 1)
  return (
    <div>
      {items.map((d) => (
        <div className="hbar-row" key={d.label}>
          <div className="hbar-label">{d.label}</div>
          <div className="hbar-track">
            <div className="hbar-bar" style={{ width: `${(d.value / max) * 72}%` }} />
            <span className="hbar-value">
              {format(d.value)}
              {d.note && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> {d.note}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export { moneyFull }
