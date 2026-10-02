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
export function HBars({
  items,
  format = int,
  onSelect,
}: {
  items: HBarItem[]
  format?: (v: number) => string
  /** when set, each row becomes a button that drills into its slice */
  onSelect?: (index: number) => void
}) {
  const max = Math.max(...items.map((d) => d.value), 1)
  return (
    <div>
      {items.map((d, i) => {
        const body = (
          <>
            <div className="hbar-label">{d.label}</div>
            <div className="hbar-track">
              <div className="hbar-bar" style={{ width: `${(d.value / max) * 72}%` }} />
              <span className="hbar-value">
                {format(d.value)}
                {d.note && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> {d.note}</span>}
              </span>
            </div>
          </>
        )
        return onSelect ? (
          <button className="hbar-row hbar-btn" key={d.label} onClick={() => onSelect(i)} aria-label={`${d.label}: view leases`}>
            {body}
          </button>
        ) : (
          <div className="hbar-row" key={d.label}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

export { moneyFull }
