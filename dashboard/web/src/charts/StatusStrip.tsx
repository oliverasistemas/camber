import { useState } from 'react'
import { StatusRow } from '../types'
import { Tooltip, TipState } from '../Tooltip'
import { useWidth } from '../useWidth'
import { int, money, pct } from '../format'

const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

/**
 * The signature mark: one full-width stacked bar of the pool by lease count,
 * 2px surface gaps between segments, rounded outer data-ends only.
 * Legend beneath carries identity; in-segment % labels only where they fit.
 */
export function StatusStrip({ status }: { status: StatusRow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const total = status.reduce((a, s) => a + s.count, 0)
  const totalPV = status.reduce((a, s) => a + s.pv, 0)
  const w = Math.max(width, 280)
  const H = 24
  const GAP = 2

  let x = 0
  const segs = status.map((s, i) => {
    const sw = total ? (s.count / total) * (w - GAP * (status.length - 1)) : 0
    const seg = { ...s, x, w: sw, color: COLORS[i % COLORS.length], first: i === 0, last: i === status.length - 1 }
    x += sw + GAP
    return seg
  })

  const segPath = (s: (typeof segs)[0]) => {
    const r = 4
    const x0 = s.x
    const x1 = s.x + s.w
    const rl = s.first ? r : 0
    const rr = s.last ? r : 0
    return `M${x0 + rl},0 H${x1 - rr} ${rr ? `Q${x1},0 ${x1},${rr} V${H - rr} Q${x1},${H} ${x1 - rr},${H}` : `V${H}`} H${x0 + rl} ${rl ? `Q${x0},${H} ${x0},${H - rl} V${rl} Q${x0},0 ${x0 + rl},0` : `V0`} Z`
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={w} height={H} role="img" aria-label="Pool composition by lease status">
        {segs.map((s) => (
          <g key={s.code}>
            <path d={segPath(s)} fill={s.color} />
            {s.w > 56 && (
              <text
                x={s.x + s.w / 2}
                y={H / 2 + 4}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={600}
                fill={s.code === 0 ? '#ffffff' : '#0b0b0b'}
              >
                {pct(s.count / total, 0)}
              </text>
            )}
            <rect
              className="hit"
              x={s.x}
              y={0}
              width={Math.max(s.w, 24)}
              height={H}
              tabIndex={0}
              aria-label={`${s.name}: ${int(s.count)} leases, ${money(s.pv)} par value`}
              onPointerEnter={() =>
                setTip({
                  x: s.x + s.w / 2,
                  y: 0,
                  title: s.name,
                  rows: [
                    { k: 'leases', v: int(s.count) },
                    { k: 'par value', v: money(s.pv) },
                  ],
                })
              }
              onFocus={() =>
                setTip({
                  x: s.x + s.w / 2,
                  y: 0,
                  title: s.name,
                  rows: [
                    { k: 'leases', v: int(s.count) },
                    { k: 'par value', v: money(s.pv) },
                  ],
                })
              }
              onPointerLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
            />
          </g>
        ))}
      </svg>
      <div className="strip-legend">
        {segs.map((s) => (
          <span key={s.code}>
            <span className="key" style={{ background: s.color }} />
            {s.name} <strong>{int(s.count)}</strong> leases, <strong>{money(s.pv)}</strong> par
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          Pool <strong>{int(total)}</strong> leases, <strong>{money(totalPV)}</strong> par
        </span>
      </div>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
