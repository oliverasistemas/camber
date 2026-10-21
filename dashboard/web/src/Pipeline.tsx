import { useEffect, useState } from 'react'
import { PipelineOverview, ScanResult, StagedRows } from './types'

const REPORT_LABEL: Record<string, string> = {
  asset_summary: 'Asset Summary',
  contract_summary: 'Contract Summary',
  transaction_history: 'Transaction History',
}

function when(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Y' : 'N'
  return String(v)
}

async function api<T>(url: string, init: RequestInit | undefined, onUnauthorized: () => void): Promise<T | null> {
  const r = await fetch(url, init)
  if (r.status === 401) {
    onUnauthorized()
    return null
  }
  if (!r.ok) {
    let msg = `API returned ${r.status}`
    try {
      const body = await r.json()
      if (body?.error) msg = body.error
    } catch {
      /* not JSON */
    }
    throw new Error(msg)
  }
  return (await r.json()) as T
}

/**
 * Pipeline step 1: Vervent file intake. Shows what the processor has staged
 * from the inbox, lets you trigger a scan, and browses the staged rows.
 */
export function Pipeline({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [ov, setOv] = useState<PipelineOverview | null>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)

  const [report, setReport] = useState('contract_summary')
  const [asof, setAsof] = useState('')
  const [offset, setOffset] = useState(0)
  const [staged, setStaged] = useState<StagedRows | null>(null)
  const [stagedError, setStagedError] = useState('')
  const [refresh, setRefresh] = useState(0) // bumped after a scan to re-query staged rows
  const limit = 25

  function loadOverview() {
    api<PipelineOverview>('/api/pipeline', undefined, onUnauthorized)
      .then((d) => {
        if (d) {
          setOv(d)
          setError('')
        }
      })
      .catch((e: Error) => setError(e.message || 'The pipeline API is unavailable. Start it with: go run ./dashboard/api'))
  }

  useEffect(loadOverview, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (asof) p.set('asof', asof)
    api<StagedRows>(`/api/pipeline/staged/${report}?${p}`, undefined, onUnauthorized)
      .then((d) => {
        if (d) {
          setStaged(d)
          setStagedError('')
        }
      })
      .catch((e: Error) => setStagedError(e.message))
  }, [report, asof, offset, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runScan() {
    setScanning(true)
    try {
      const r = await api<ScanResult>('/api/pipeline/scan', { method: 'POST' }, onUnauthorized)
      if (r) {
        setScan(r)
        setError('')
        loadOverview()
        setOffset(0)
        setRefresh((n) => n + 1)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  const proc = ov?.processor ?? null
  const last = scan ?? proc?.lastScan ?? null
  const total = staged?.total ?? 0

  return (
    <div className="app pipeline">
      <a className="crumb" href="#/">
        ← Pool dashboard
      </a>
      <h1 className="deal-name">Pipeline</h1>
      <p className="deal-sub">Step 1 · Vervent file intake — report drops staged into the vervent schema</p>

      {error && <p className="deal-sub pipeline-error">{error}</p>}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Processor</h3>
            <p className="panel-sub">
              {proc ? (
                <>
                  Watching <code>{proc.inbox}</code> every {proc.interval}
                  {proc.running ? ' · scanning now' : ''}
                </>
              ) : ov ? (
                'No inbox configured on the API (set VERVENT_INBOX); only already-staged data is shown.'
              ) : (
                'Loading…'
              )}
            </p>
          </div>
          <button className="pipeline-btn" onClick={runScan} disabled={scanning || !proc}>
            {scanning ? 'Scanning…' : 'Scan inbox now'}
          </button>
        </div>
        {last && (
          <>
            <p className="panel-sub">
              Last scan ({last.trigger}) finished {when(last.finishedAt)}: {last.loaded} loaded, {last.unchanged} unchanged,{' '}
              {last.failed} failed, {last.skipped} skipped
            </p>
            {last.files.length > 0 && (
              <div className="wide-table">
                <table className="viz-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Report</th>
                      <th>As of</th>
                      <th>Result</th>
                      <th className="num">Rows</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.files.map((f) => (
                      <tr key={f.path}>
                        <td>{f.filename}</td>
                        <td>{REPORT_LABEL[f.reportType] ?? f.reportType}</td>
                        <td>{f.asOf}</td>
                        <td>
                          <span className={`badge badge-${f.status}`}>{f.status}</span>
                        </td>
                        <td className="num">{f.rows || ''}</td>
                        <td className="detail">{f.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Staged files</h3>
        <p className="panel-sub">One row per file in vervent.report_file; reloading a file replaces its rows.</p>
        {ov && ov.files.length === 0 && <p className="panel-sub">Nothing staged yet.</p>}
        {ov && ov.files.length > 0 && (
          <div className="wide-table">
            <table className="viz-table">
              <thead>
                <tr>
                  <th>As of</th>
                  <th>Report</th>
                  <th>Cadence</th>
                  <th>File</th>
                  <th className="num">Rows</th>
                  <th>Loaded</th>
                  <th>sha256</th>
                </tr>
              </thead>
              <tbody>
                {ov.files.map((f) => (
                  <tr
                    key={f.fileId}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => {
                      setReport(f.reportType)
                      setAsof(f.asOf)
                      setOffset(0)
                    }}
                  >
                    <td>{f.asOf}</td>
                    <td>{REPORT_LABEL[f.reportType] ?? f.reportType}</td>
                    <td>{f.cadence ?? ''}</td>
                    <td>{f.filename}</td>
                    <td className="num">{f.rowCount ?? ''}</td>
                    <td>{when(f.loadedAt)}</td>
                    <td className="mono">{f.sha256?.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ov && ov.events.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Recent load events</h3>
          <p className="panel-sub">Every load attempt by the processor, newest first.</p>
          <div className="wide-table">
            <table className="viz-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Trigger</th>
                  <th>File</th>
                  <th>Result</th>
                  <th className="num">Rows</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {ov.events.map((e) => (
                  <tr key={e.eventId}>
                    <td>{when(e.at)}</td>
                    <td>{e.trigger}</td>
                    <td>{e.filename}</td>
                    <td>
                      <span className={`badge badge-${e.status}`}>{e.status}</span>
                    </td>
                    <td className="num">{e.rowCount ?? ''}</td>
                    <td className="detail">{e.message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Staged data</h3>
            <p className="panel-sub">
              {staged ? `${staged.total} rows in vervent.${staged.report}${staged.asOf ? ` as of ${staged.asOf}` : ''}` : 'Loading…'}
            </p>
          </div>
          <div className="filters pipeline-filters" role="group" aria-label="Staged data selection">
            <label>
              Report
              <select
                value={report}
                onChange={(e) => {
                  setReport(e.target.value)
                  setAsof('')
                  setOffset(0)
                }}
              >
                {(ov?.reports ?? Object.keys(REPORT_LABEL)).map((r) => (
                  <option key={r} value={r}>
                    {REPORT_LABEL[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              As of
              <select
                value={asof || staged?.asOf || ''}
                onChange={(e) => {
                  setAsof(e.target.value)
                  setOffset(0)
                }}
              >
                {(staged?.asOfs ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {stagedError && <p className="deal-sub pipeline-error">{stagedError}</p>}
        {staged && staged.rows.length === 0 && <p className="panel-sub">No rows.</p>}
        {staged && staged.rows.length > 0 && (
          <>
            <div className="wide-table tall">
              <table className="viz-table staged">
                <thead>
                  <tr>
                    {staged.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staged.rows.map((r, i) => (
                    <tr key={i}>
                      {staged.columns.map((c) => (
                        <td key={c}>{cell(r[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="pipeline-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                ← Previous
              </button>
              <span>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button className="pipeline-btn" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
                Next →
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
