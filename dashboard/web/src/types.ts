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

export interface LeaseListRow {
  leaseId: number
  vin: string
  modelYear: number
  description: string
  statusCode: number
  statusName: string
  obligorType: string
  newUsed: string
  daysDelinquent: number
  maturityDate: string
  paymentRegular: number
  pv: number | null
  isEligible: boolean
}

export interface LeaseList {
  total: number
  pvTotal: number
  offset: number
  limit: number
  rows: LeaseListRow[]
}

export interface LeaseDetail {
  leaseId: number
  vin: string
  newUsed: string
  openClosed: string
  obligorType: string
  isExtended: boolean
  termMonths: number
  leaseDate: string
  maturityDate: string
  origCost: number
  contractResidual: number
  paymentRegular: number
  algModel: string
  leaseDcf: number
  modelYear: number
  description: string
  fuelType: string
  statusCode: number | null
  statusName: string | null
  terminationType: string | null
  terminationTiming: string | null
  soldMonth: string | null
  netSalesProceeds: number | null
  periodPaymentCollected: number | null
  daysDelinquent: number | null
  paymentsRemaining: number | null
  isEligible: boolean | null
  discountRate: number | null
  pvTotal: number | null
  pvContractResidual: number | null
  pvEligible: number | null
  pvTotalPrior: number | null
}

export interface Filters {
  obligor: '' | 'B' | 'P'
  condition: '' | 'N' | 'U'
  eligible: '' | '1'
}
