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
	Bucket    string `json:"bucket"`
	Contracts int    `json:"contracts"`
}

type statusCount struct {
	Status string `json:"status"`
	Label  string `json:"label"`
	Assets int    `json:"assets"`
}

type verventMetrics struct {
	AsOf                   string        `json:"as_of"`
	TotalContracts         int           `json:"total_contracts"`
	ActiveContracts        int           `json:"active_contracts"`
	OutstandingReceivables float64       `json:"outstanding_receivables"`
	PastDue                float64       `json:"past_due"`
	DelinquentContracts    int           `json:"delinquent_contracts"`
	DelinquencyRate        float64       `json:"delinquency_rate"` // percent of active contracts
	Collections30d         float64       `json:"collections_30d"`
	DelinquencyBuckets     []bucketCount `json:"delinquency_buckets"`
	AssetStatus            []statusCount `json:"asset_status"`
	TotalAssets            int           `json:"total_assets"`
}

func (s *verventStore) handleMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.metrics())
}

// metrics summarizes the portfolio. Contract figures cover open contracts only; collections are
// cash payments in the 30 days up to the latest transaction date, which is reported as as_of.
func (s *verventStore) metrics() verventMetrics {
	m := verventMetrics{
		TotalContracts: len(s.contracts.rows),
		TotalAssets:    len(s.assets.rows),
	}

	buckets := map[string]int{}
	for _, c := range s.contracts.rows {
		if open, _ := c["is_account_open"].(bool); !open {
			continue
		}
		m.ActiveContracts++
		m.OutstandingReceivables += num(c["remaining_receivables"])
		m.PastDue += num(c["total_past_due"])
		if num(c["days_del"]) > 0 {
			m.DelinquentContracts++
			if b, ok := c["curr_delinq"].(string); ok {
				buckets[b]++
			}
		}
	}
	if m.ActiveContracts > 0 {
		m.DelinquencyRate = float64(m.DelinquentContracts) / float64(m.ActiveContracts) * 100
	}
	for _, b := range delinquencyBuckets {
		m.DelinquencyBuckets = append(m.DelinquencyBuckets, bucketCount{Bucket: b, Contracts: buckets[b]})
	}

	for _, t := range s.transactions.rows {
		if d, _ := t["transaction_date_key"].(string); d > m.AsOf {
			m.AsOf = d
		}
	}
	if asOf, err := time.Parse(time.DateOnly, m.AsOf); err == nil {
		since := asOf.AddDate(0, 0, -30).Format(time.DateOnly)
		for _, t := range s.transactions.rows {
			nonCash, _ := t["is_non_cash"].(bool)
			if d, _ := t["transaction_date_key"].(string); !nonCash && d > since {
				m.Collections30d += num(t["payment_amount"])
			}
		}
	}

	statuses := map[string]int{}
	for _, a := range s.assets.rows {
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
