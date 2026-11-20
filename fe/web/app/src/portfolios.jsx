import { useEffect, useState } from 'react'

// Camber's portfolios (/api/portfolios). The servicer's tables hold leases that are not Camber's
// too; a row is Camber's when its lease is in a portfolio, and the dashboard counts those only.
// The portfolio is the camber_portfolio column of the Vervent lists and the lease terminations,
// and the portfolio column of a snapshot's contract rows.

let loaded // one fetch per page load, shared by every table

// usePortfolios returns the portfolio names, [] until they arrive.
export function usePortfolios() {
  const [names, setNames] = useState([])
  useEffect(() => {
    loaded ??= fetch('/api/portfolios?limit=1000')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body) => body.data.map((p) => p.name))
      .catch(() => [])
    let cancelled = false
    loaded.then((n) => !cancelled && setNames(n))
    return () => {
      cancelled = true
    }
  }, [])
  return names
}

// inPortfolio is the list filter for the rows a figure counts: those of one portfolio, or of any
// portfolio when no name is given. The same condition as inPortfolio in be/rest/metrics.go.
export const inPortfolio = (name, column = 'camber_portfolio') =>
  name ? { [column]: name } : { [`${column}.ne`]: 'null' }

// camberList is the path of a list page opened on Camber's leases. The filter shows above the
// table as a tag; removing it lists the leases that are not Camber's as well.
export const camberList = (path) => `${path}?${new URLSearchParams(inPortfolio())}`

// portfolioColumn is the table column, filtered by picking a portfolio.
export const portfolioColumn = (names, dataIndex = 'camber_portfolio') => ({
  title: 'Portfolio',
  dataIndex,
  filters: [...names.map((n) => ({ text: n, value: n })), { text: 'Not in a portfolio', value: 'null' }],
  // The tag for the filter every list opens with (dataIndex.ne=null).
  anyLabel: "Camber's leases",
})
