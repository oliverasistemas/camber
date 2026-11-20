package main

import (
	"encoding/json"
	"math"
	"net/http"
	"time"
)

var delinquencyBuckets = []string{"1-30", "31-60", "61-90", "91-120", "121-150", "151-180", "181+"}

// assetStatuses lists asset status codes in display order with their meanings from the data dictionary.
var assetStatuses = []struct{ code, label string }{
	{"NLSE", "On lease"},
	{"ULSE", "Re-leased"},
	{"URIN", "Returned to inventory"},
	{"NRIV", "In inventory"},
	{"USLD", "Sold"},
}

type bucketCount struct {
	Bucket string `json:"bucket"`
	Leases int    `json:"leases"`
}

type statusCount struct {
	Status string `json:"status"`
	Label  string `json:"label"`
	Assets int    `json:"assets"`
}

type verventMetrics struct {
	AsOf                   string        `json:"as_of"`
	TotalContracts         int           `json:"total_contracts"`
	TotalLeases            int           `json:"total_leases"`
	ActiveContracts        int           `json:"active_contracts"`
	ActiveLeases           int           `json:"active_leases"`
	OutstandingReceivables float64       `json:"outstanding_receivables"`
	PastDue                float64       `json:"past_due"`
	DelinquentLeases       int           `json:"delinquent_leases"`
	DelinquencyRate        float64       `json:"delinquency_rate"` // percent of active leases
	Collections30d         float64       `json:"collections_30d"`
	CollectionsMTD         float64       `json:"collections_mtd"` // the as_of month up to as_of
	DelinquencyBuckets     []bucketCount `json:"delinquency_buckets"`
	AssetStatus            []statusCount `json:"asset_status"`
	TotalAssets            int           `json:"total_assets"`
}

// Every figure the dashboard shows counts Camber's leases only: the rows with a camber_portfolio
// (vervent/sql/05_portfolio_views.sql). ?portfolio=<name> on a metrics or summary endpoint narrows
// them to that portfolio. A list is filtered the same way with camber_portfolio=<name>, or
// camber_portfolio.ne=null for every portfolio, so a figure's list adds up to it.

// inPortfolio is that condition in SQL, with the portfolio asked for (empty for any) as $1.
const inPortfolio = `(camber_portfolio = $1 OR ($1 = '' AND camber_portfolio IS NOT NULL))`

// rowInPortfolio is the same condition over a mock row.
func rowInPortfolio(rw row, portfolio string) bool {
	p, ok := rw["camber_portfolio"].(string)
	return ok && (portfolio == "" || p == portfolio)
}

func (s *verventStore) handleMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.metrics(r.URL.Query().Get("portfolio")))
}

// leaseSet collects the leases (Camber lease ids) a figure counts: a lease's deficiency contracts
// share its id with the main contract, so the lease counts once however many of them qualify.
type leaseSet map[string]struct{}

func (s leaseSet) add(id any) { s[str(id)] = struct{}{} }

// metrics summarizes Camber's leases, or those of one portfolio. A lease is its main contract and
// its deficiency contracts together (camber_lease_id): it is active while any of them is open and
// delinquent while an open one is past due, and the dollar figures add up its open contracts.
// A delinquency bucket counts the leases with a delinquent open contract in it. Collections are
// cash payments in the 30 days up to the latest transaction date of any lease, which is reported
// as as_of, and in that date's month so far.
func (s *verventStore) metrics(portfolio string) verventMetrics {
	var m verventMetrics

	leases, active, delinquent := leaseSet{}, leaseSet{}, leaseSet{}
	buckets := map[string]leaseSet{}
	for _, c := range s.contracts.rows {
		if !rowInPortfolio(c, portfolio) {
			continue
		}
		m.TotalContracts++
		leases.add(c["camber_lease_id"])
		if open, _ := c["is_account_open"].(bool); !open {
			continue
		}
		m.ActiveContracts++
		active.add(c["camber_lease_id"])
		m.OutstandingReceivables += num(c["remaining_receivables"])
		m.PastDue += num(c["total_past_due"])
		if num(c["days_del"]) > 0 {
			delinquent.add(c["camber_lease_id"])
			if b, ok := c["curr_delinq"].(string); ok {
				if buckets[b] == nil {
					buckets[b] = leaseSet{}
				}
				buckets[b].add(c["camber_lease_id"])
			}
		}
	}
	m.TotalLeases, m.ActiveLeases, m.DelinquentLeases = len(leases), len(active), len(delinquent)
	if m.ActiveLeases > 0 {
		m.DelinquencyRate = float64(m.DelinquentLeases) / float64(m.ActiveLeases) * 100
	}
	for _, b := range delinquencyBuckets {
		m.DelinquencyBuckets = append(m.DelinquencyBuckets, bucketCount{Bucket: b, Leases: len(buckets[b])})
	}

	for _, t := range s.transactions.rows {
		if d, _ := t["transaction_date_key"].(string); d > m.AsOf {
			m.AsOf = d
		}
	}
	if asOf, err := time.Parse(time.DateOnly, m.AsOf); err == nil {
		since := asOf.AddDate(0, 0, -30).Format(time.DateOnly)
		monthStart := asOf.Format("2006-01") + "-01"
		for _, t := range s.transactions.rows {
			if nonCash, _ := t["is_non_cash"].(bool); nonCash || !rowInPortfolio(t, portfolio) {
				continue
			}
			d, _ := t["transaction_date_key"].(string)
			if d > since {
				m.Collections30d += num(t["payment_amount"])
			}
			if d >= monthStart && d <= m.AsOf {
				m.CollectionsMTD += num(t["payment_amount"])
			}
		}
	}

	statuses := map[string]int{}
	for _, a := range s.assets.rows {
		if !rowInPortfolio(a, portfolio) {
			continue
		}
		m.TotalAssets++
		if st, ok := a["status"].(string); ok {
			statuses[st]++
		}
	}
	for _, st := range assetStatuses {
		if n := statuses[st.code]; n > 0 {
			m.AssetStatus = append(m.AssetStatus, statusCount{Status: st.code, Label: st.label, Assets: n})
		}
	}

	m.OutstandingReceivables = round2(m.OutstandingReceivables)
	m.PastDue = round2(m.PastDue)
	m.Collections30d = round2(m.Collections30d)
	m.CollectionsMTD = round2(m.CollectionsMTD)
	return m
}

// num reads a JSON number column; null or non-numeric values count as 0.
func num(v any) float64 {
	n, ok := v.(json.Number)
	if !ok {
		return 0
	}
	f, _ := n.Float64()
	return f
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}
