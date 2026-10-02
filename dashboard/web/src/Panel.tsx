import { ReactNode, useState } from 'react'

export interface TableSpec {
  cols: { name: string; numeric?: boolean }[]
  rows: (string | number)[][]
  /** when set, table rows drill into their slice */
  onRow?: (index: number) => void
}

/**
 * Chart panel with its WCAG-clean twin: a Chart/Table toggle in the header.
 * Every value a chart shows is reachable in the table without hovering.
 */
export function Panel({
  title,
  sub,
  table,
  loading,
  children,
}: {
  title: string
  sub: string
  table: TableSpec
  loading: boolean
  children: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className={loading ? 'panel loading' : 'panel'}>
      <div className="panel-head">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="panel-sub">{sub}</p>
        </div>
        <div className="toggle" role="group" aria-label={`${title} view`}>
          <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
            Chart
          </button>
          <button aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
      </div>
      {view === 'chart' ? (
        children
      ) : (
        <table className="viz-table">
          <thead>
            <tr>
              {table.cols.map((c) => (
                <th key={c.name} className={c.numeric ? 'num' : undefined}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr
                key={i}
                className={table.onRow ? 'row-link' : undefined}
                tabIndex={table.onRow ? 0 : undefined}
                onClick={table.onRow ? () => table.onRow!(i) : undefined}
                onKeyDown={
                  table.onRow
                    ? (e) => {
                        if (e.key === 'Enter') table.onRow!(i)
                      }
                    : undefined
                }
              >
                {r.map((cell, j) => (
                  <td key={j} className={table.cols[j].numeric ? 'num' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
