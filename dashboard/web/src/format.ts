export function money(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`
  if (abs >= 1e3) return `$${Math.round(n / 1e3).toLocaleString()}K`
  return `$${Math.round(n).toLocaleString()}`
}

export function moneyFull(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

export function int(n: number): string {
  return n.toLocaleString()
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`
}

/** '2025-10' → 'Oct 25' */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[m - 1]} ${String(y).slice(2)}`
}

/** '2026 Q1' → 'Q1 26' */
export function quarterLabel(q: string): string {
  const [y, qq] = q.split(' ')
  return `${qq} ${y.slice(2)}`
}

/** '2027-08-05' → 'Aug 5, 2027' */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[m - 1]} ${d}, ${y}`
}

/** '2026-05' → 'May 2026' */
export function monthFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[m - 1]} ${y}`
}

/** Clean axis ticks: 0..max covered by ~4 steps of 1/2/2.5/5 × 10^k */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks.length * step)
  return ticks
}

export function axisMoney(n: number): string {
  if (n >= 1e6) return `$${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${n}`
}
