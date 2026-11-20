package main

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

// maturingWindowDays is how far ahead of maturity a lease on lease counts as maturing: the template's
// first pre-termination outreach is at 180 days.
const maturingWindowDays = 180

// terminationGroups are the groups of lease_terminations rows the summary totals, in display order:
// the three stages, and the leases on lease that mature within the window or are already past maturity.
var terminationGroups = []string{"on lease", "maturing", "past maturity", "returned", "sold"}

type terminationGroup struct {
	Key             string  `json:"key"`
	Units           int     `json:"units"`
	Residual        float64 `json:"residual"`
	NetSaleProceeds float64 `json:"net_sale_proceeds"`
	GainLoss        float64 `json:"gain_loss"`
}

// terminationSummary carries the dates behind the maturing and past maturity groups, so the page can
// link each to the list with the very filter that was counted: maturity_date.lt=as_of for past
// maturity, maturity_date.gte=as_of&maturity_date.lte=maturing_by for maturing.
type terminationSummary struct {
	AsOf       string             `json:"as_of"`
	MaturingBy string             `json:"maturing_by"`
	Groups     []terminationGroup `json:"groups"`
}

func newTerminationSummary() terminationSummary {
	today := time.Now()
	return terminationSummary{
		AsOf:       today.Format(time.DateOnly),
		MaturingBy: today.AddDate(0, 0, maturingWindowDays).Format(time.DateOnly),
	}
}

// finish orders the groups, with zeros for the ones without rows, and rounds the sums.
func (s terminationSummary) finish(byKey map[string]terminationGroup) terminationSummary {
	for _, k := range terminationGroups {
		g := byKey[k]
		g.Key = k
		g.Residual = round2(g.Residual)
		g.NetSaleProceeds = round2(g.NetSaleProceeds)
		g.GainLoss = round2(g.GainLoss)
		s.Groups = append(s.Groups, g)
	}
	return s
}

func (s *verventStore) handleTerminationSummary(w http.ResponseWriter, r *http.Request) {
	sum := newTerminationSummary()
	byKey := map[string]terminationGroup{}
	add := func(key string, t row) {
		g := byKey[key]
		g.Units++
		g.Residual += num(t["residual"])
		g.NetSaleProceeds += num(t["net_sale_proceeds"])
		g.GainLoss += num(t["gain_loss"])
		byKey[key] = g
	}
	for _, t := range s.terminations.rows {
		stage, _ := t["stage"].(string)
		add(stage, t)
		if maturity, ok := t["maturity_date"].(string); ok && stage == "on lease" {
			if maturity < sum.AsOf {
				add("past maturity", t)
			} else if maturity <= sum.MaturingBy {
				add("maturing", t)
			}
		}
	}
	writeJSON(w, sum.finish(byKey))
}

// handleTerminationSummary computes the same figures as verventStore.handleTerminationSummary, in SQL.
func (s *pgVervent) handleTerminationSummary(w http.ResponseWriter, r *http.Request) {
	sum := newTerminationSummary()
	byKey := map[string]terminationGroup{}
	if s.terminations.db == nil { // the view doesn't exist yet
		writeJSON(w, sum.finish(byKey))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT g.key, count(*), coalesce(sum(residual), 0)::float8,
		       coalesce(sum(net_sale_proceeds), 0)::float8, coalesce(sum(gain_loss), 0)::float8
		  FROM lease_terminations
		 CROSS JOIN LATERAL (VALUES
		       (stage),
		       (CASE WHEN stage <> 'on lease' THEN NULL
		             WHEN maturity_date < $1::date THEN 'past maturity'
		             WHEN maturity_date <= $2::date THEN 'maturing' END)) g(key)
		 WHERE g.key IS NOT NULL
		 GROUP BY g.key`, sum.AsOf, sum.MaturingBy)
	if err != nil {
		serverError(w, err)
		return
	}
	var g terminationGroup
	_, err = pgx.ForEachRow(rows, []any{&g.Key, &g.Units, &g.Residual, &g.NetSaleProceeds, &g.GainLoss}, func() error {
		byKey[g.Key] = g
		return nil
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, sum.finish(byKey))
}
