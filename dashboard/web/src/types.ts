export interface Summary {
  totalLeases: number
  active: number
  inventory: number
  sold: number
  pvTotal: number
  pvEligible: number
  collections: number
  proceeds: number
  delinquent30: number
}

export interface StatusRow {
  code: number
  name: string
  count: number
  pv: number
}

export interface BucketRow {
  bucket: string
  count: number
  pv: number
}

export interface MonthRow {
  month: string
  count: number
  proceeds: number
}

export interface TypeRow {
  type: string
  count: number
  proceeds: number
}

export interface QuarterRow {
  quarter: string
  count: number
  pv: number
}

export interface YearRow {
  year: number
  count: number
  pv: number
}

export interface Dashboard {
  asOf: string
  summary: Summary
  status: StatusRow[]
  delinquency: BucketRow[]
  terminationsByMonth: MonthRow[]
  terminationsByType: TypeRow[]
  runoff: QuarterRow[]
  modelYears: YearRow[]
}

export interface Filters {
  obligor: '' | 'B' | 'P'
  condition: '' | 'N' | 'U'
  eligible: '' | '1'
}
