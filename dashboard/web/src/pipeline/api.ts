/** Shared helpers for the pipeline pages (Vervent file intake). */

/** An API error that keeps the HTTP status and the parsed JSON body. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> | null,
  ) {
    super(message)
  }
}

/** fetch + JSON. A 401 calls onUnauthorized and resolves to null; other failures throw ApiError. */
export async function api<T>(url: string, init: RequestInit | undefined, onUnauthorized: () => void): Promise<T | null> {
  const r = await fetch(url, init)
  if (r.status === 401) {
    onUnauthorized()
    return null
  }
  if (!r.ok) {
    let body: Record<string, unknown> | null = null
    try {
      body = await r.json()
    } catch {
      /* not JSON */
    }
    const msg = typeof body?.error === 'string' ? body.error : `The API returned ${r.status}.`
    throw new ApiError(msg, r.status, body)
  }
  return (await r.json()) as T
}

export interface ReportDef {
  type: string // vervent table / report_type
  slug: string // route segment
  label: string
  key: string[] // identifying columns, pinned to the left of the rows table
}

export const REPORTS: ReportDef[] = [
  { type: 'asset_summary', slug: 'asset-summary', label: 'Asset Summary', key: ['asset_no'] },
  { type: 'contract_summary', slug: 'contract-summary', label: 'Contract Summary', key: ['lease_no'] },
  { type: 'transaction_history', slug: 'transaction-history', label: 'Transaction History', key: ['transaction_key'] },
]

export const reportByType = (t: string) => REPORTS.find((r) => r.type === t)
export const reportBySlug = (s: string) => REPORTS.find((r) => r.slug === s)
export const reportLabel = (t: string | null | undefined) => (t ? (reportByType(t)?.label ?? t) : '')

/** The route of one loaded file's rows. */
export function fileHref(reportType: string, fileId: number, query?: URLSearchParams): string {
  const slug = reportByType(reportType)?.slug ?? reportType
  const q = query?.toString()
  return `#/pipeline/${slug}/${fileId}${q ? `?${q}` : ''}`
}

export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString())
