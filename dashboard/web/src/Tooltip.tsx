export interface TipState {
  x: number
  y: number
  title: string
  rows: { k: string; v: string }[]
}

/** Floating readout: value leads, label follows. Positioned inside .chart-wrap. */
export function Tooltip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null
  const flip = tip.x > width - 150
  return (
    <div
      className="tooltip"
      role="status"
      style={{
        left: flip ? undefined : tip.x + 12,
        right: flip ? width - tip.x + 12 : undefined,
        top: Math.max(0, tip.y - 10),
      }}
    >
      <div className="tt-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="tt-row" key={r.k}>
          <span className="v">{r.v}</span>
          <span className="k">{r.k}</span>
        </div>
      ))}
    </div>
  )
}
