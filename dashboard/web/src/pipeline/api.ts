/** Shared helpers for the pipeline pages (Vervent file intake + the Copart weekly report). */

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
  type: string // report_type: vervent table name, or copart_<tab>
  slug: string // route segment
  label: string
  key: string[] // identifying columns, pinned to the left of the rows table
  // Shown until the viewer picks their own; with the key, at most 9 columns.
  // Chosen from the 2026-10-20 files: well-filled, informative columns a
  // servicing reader looks for first (who, what, status, money, dates).
  defaults: string[]
}

export const REPORTS: ReportDef[] = [
  {
    type: 'asset_summary',
    slug: 'asset-summary',
    label: 'Asset Summary',
    key: ['asset_no'],
    defaults: ['lease', 'name', 'description', 'serial_number', 'status', 'contr_status', 'orig_cost', 'in_svc_date'],
  },
  {
    type: 'contract_summary',
    slug: 'contract-summary',
    label: 'Contract Summary',
    key: ['lease_no'],
    defaults: [
      'lessee_name',
      'ls_status',
      'first_asset_desc',
      'maturity_date',
      'curr_pymt',
      'remaining_receivables',
      'days_del',
      'total_past_due',
    ],
  },
  {
    type: 'transaction_history',
    slug: 'transaction-history',
    label: 'Transaction History',
    key: ['transaction_key'],
    defaults: [
      'contract_number',
      'name',
      'description',
      'effective_date_key',
      'date_due_date_key',
      'transaction_amount',
      'payment_amount',
    ],
  },
  // Copart weekly Sales & Inventory report, one entry per tab (schema copart).
  {
    type: 'copart_inventory',
    slug: 'copart-inventory',
    label: 'Copart Inventory',
    key: ['lot_nbr'],
    defaults: ['vin', 'year', 'make', 'model', 'inventory_status', 'physical_location', 'days_in_yard', 'proquote', 'date_of_sell'],
  },
  {
    type: 'copart_sales',
    slug: 'copart-sales',
    label: 'Copart Sales',
    key: ['lot_nbr'],
    defaults: ['vin', 'year', 'make', 'model', 'sale_date', 'sales_status', 'gross_sale_price', 'total_seller_charges', 'net_sale_proceeds'],
  },
]

/** The file a row came from as the reader knows it: the Copart xlsx, or the Vervent CSV. */
export const fileLabel = (f: { filename: string; sourceFile?: string | null } | null | undefined) => f?.sourceFile ?? f?.filename ?? ''

export const reportByType = (t: string) => REPORTS.find((r) => r.type === t)
// Routes use the slug (copart-sales); the report type (copart_sales) is accepted too, for hand-typed links.
export const reportBySlug = (s: string) => REPORTS.find((r) => r.slug === s || r.type === s)
export const reportLabel = (t: string | null | undefined) => (t ? (reportByType(t)?.label ?? t) : '')

/** The route of one loaded file's rows. */
export function fileHref(reportType: string, fileId: number, query?: URLSearchParams): string {
  const slug = reportByType(reportType)?.slug ?? reportType
  const q = query?.toString()
  return `#/pipeline/${slug}/${fileId}${q ? `?${q}` : ''}`
}

/** The route of one contract with its asset and transactions. */
export function contractHref(leaseNo: string, asOf?: string): string {
  return `#/pipeline/contract/${encodeURIComponent(leaseNo)}${asOf ? `?asof=${asOf}` : ''}`
}

/** A staged value as table text. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Y' : 'N'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString())
