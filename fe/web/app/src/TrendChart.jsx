import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Typography } from 'antd'

const H = 220
const PAD = { top: 16, right: 64, bottom: 28, left: 8 }
const LINE = '#2a78d6'
const INK = 'rgba(0, 0, 0, 0.45)'
const GRID = '#f0f0f0'

const time = (iso) => new Date(`${iso}T00:00:00Z`).getTime()
const shortDay = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

// niceTicks returns about n round values spanning [min, max], widened so the line never touches
// the frame. A trend line shows change, so the axis does not start at zero.
function niceTicks(min, max, n = 4) {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / (n - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  const lo = Math.floor(min / step) * step
  const ticks = []
  for (let v = lo; v < max + step; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

// TrendChart: one measure over the daily file dates as a line with a marker per day. Days are
// placed on a real time axis, so a day with no file (weekend, missed drop) shows as a gap in the
// markers. Each day is a link to the rows behind its figure (data[i].to); hovering anywhere in
// a day's column shows its value. format renders a value for the tooltip, axis for the tick labels.
// The chart is drawn at its container's width rather than scaled, so text keeps its size.
export default function TrendChart({ data, format, axis = format, label }) {
  const [hover, setHover] = useState(null)
  const [W, setW] = useState(560)
  const box = useRef(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const titleId = useId()
  const t0 = time(data[0].date)
  const t1 = time(data[data.length - 1].date)
  const ticks = niceTicks(Math.min(...data.map((d) => d.value)), Math.max(...data.map((d) => d.value)))
  const [y0, y1] = [ticks[0], ticks[ticks.length - 1]]
  const x = (d) => PAD.left + 12 + ((time(d.date) - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right - 24)
  const y = (v) => H - PAD.bottom - ((v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)
  const pts = data.map((d) => ({ ...d, x: x(d), y: y(d.value) }))

  // Each day's hit area runs halfway to its neighbours, full height.
  const edge = (i) => (i < 0 ? PAD.left : i >= pts.length - 1 ? W - PAD.right : (pts[i].x + pts[i + 1].x) / 2)
  // Date labels: both ends, plus as many in between as fit without touching.
  const stride = Math.ceil(pts.length / Math.max(2, Math.floor(W / 90)))
  const labelled = (i) => i === pts.length - 1 || (i % stride === 0 && pts[pts.length - 1].x - pts[i].x > 56)
  const shown = hover == null ? null : pts[hover]

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg width={W} height={H} role="img" aria-labelledby={titleId} style={{ display: 'block' }}>
        <title id={titleId}>{`${label}, ${shortDay(data[0].date)} to ${shortDay(data[data.length - 1].date)}`}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={W - PAD.right + 8} y={y(v)} dy="0.32em" fontSize="12" fill={INK}>
              {axis(v)}
            </text>
          </g>
        ))}
        {shown && <line x1={shown.x} x2={shown.x} y1={PAD.top} y2={H - PAD.bottom} stroke="#d9d9d9" />}
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={LINE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <text key={p.date} x={p.x} y={H - 8} textAnchor="middle" fontSize="12" fill={INK} visibility={labelled(i) ? 'visible' : 'hidden'}>
            {shortDay(p.date)}
          </text>
        ))}
        {pts.map((p, i) => (
          <Link
            key={p.date}
            to={p.to}
            className="trend-day"
            aria-label={`${shortDay(p.date)}: ${format(p.value)}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <rect x={edge(i - 1)} y={PAD.top} width={edge(i) - edge(i - 1)} height={H - PAD.top - PAD.bottom} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill={LINE} stroke="#fff" strokeWidth="2" />
          </Link>
        ))}
      </svg>
      {shown && (
        <div
          className="trend-tip"
          style={{
            left: `${(shown.x / W) * 100}%`,
            top: `${(shown.y / H) * 100}%`,
            transform: `translate(${shown.x > W / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
          }}
        >
          <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(shown.value)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {shortDay(shown.date)}
            {shown.note && `, ${shown.note}`}
          </Typography.Text>
        </div>
      )}
    </div>
  )
}
