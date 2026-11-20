package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"mime"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"camber/pipeline/portfolio"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Portfolio snapshots (portfolio/sql/01_portfolio_snapshots.sql): frozen, servicer-neutral copies
// of the contracts of Camber's leases, each with its totals. /api/snapshots serves, for both backends:
//
//	GET  /                           the snapshots (list contract), newest first
//	POST /                           take a manual snapshot of the contracts as loaded now
//	GET  /history                    the daily snapshots' totals, oldest first: the by-day charts.
//	                                 ?portfolio=<name>: the totals of that portfolio's rows instead
//	GET  /contracts                  contract rows of every snapshot (list contract), without servicer_row
//	GET  /{id}                       one snapshot
//	GET  /{id}/portfolios            the snapshot's totals per portfolio, computed from its rows
//	GET  /{id}/contracts/{contract}  one contract row, with the servicer's whole row

// snapshotDay is one daily snapshot's totals. The figures cover the contracts open that day.
type snapshotDay struct {
	SnapshotID             int64   `json:"snapshot_id"`
	AsOf                   string  `json:"as_of"`
	TotalContracts         int     `json:"total_contracts"`
	ActiveContracts        int     `json:"active_contracts"`
	OutstandingReceivables float64 `json:"outstanding_receivables"`
	PastDue                float64 `json:"past_due"`
	DelinquentContracts    int     `json:"delinquent_contracts"`
	DelinquencyRate        float64 `json:"delinquency_rate"` // percent of active contracts
}

// portfolioTotals is the part of a snapshot that belongs to one portfolio, totalled like the
// snapshot itself. Portfolio is null for the rows without one: leases that are not Camber's, which
// only snapshots taken before the lease list was loaded hold.
type portfolioTotals struct {
	Portfolio *string `json:"portfolio"`
	snapshotDay
}

// add counts one snapshot contract row (mock) into the totals, by the formulas of
// portfolio.Capture.
func (d *snapshotDay) add(rw row) {
	d.TotalContracts++
	if open, _ := rw["is_open"].(bool); !open {
		return
	}
	d.ActiveContracts++
	d.OutstandingReceivables += num(rw["outstanding_receivables"])
	d.PastDue += num(rw["past_due"])
	if num(rw["days_delinquent"]) > 0 {
		d.DelinquentContracts++
	}
}

// finish rounds the sums and derives the rate once the counts are in.
func (d snapshotDay) finish() snapshotDay {
	d.OutstandingReceivables, d.PastDue = round2(d.OutstandingReceivables), round2(d.PastDue)
	d.DelinquencyRate = 0
	if d.ActiveContracts > 0 {
		d.DelinquencyRate = float64(d.DelinquentContracts) / float64(d.ActiveContracts) * 100
	}
	return d
}

const (
	maxSnapshotName = 200
	maxSnapshotNote = 2000
)

type snapshotRequest struct {
	Name string `json:"name"`
	Note string `json:"note"`
}

// readSnapshotRequest reads the body of POST /api/snapshots, or answers with the error and
// returns false. Requiring a JSON content type keeps a cross-site form post from taking one.
func readSnapshotRequest(w http.ResponseWriter, r *http.Request) (snapshotRequest, bool) {
	var req snapshotRequest
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		http.Error(w, "content type must be application/json", http.StatusUnsupportedMediaType)
		return req, false
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return req, false
	}
	req.Name, req.Note = strings.TrimSpace(req.Name), strings.TrimSpace(req.Note)
	switch {
	case req.Name == "":
		http.Error(w, "name is required", http.StatusBadRequest)
	case utf8.RuneCountInString(req.Name) > maxSnapshotName:
		http.Error(w, fmt.Sprintf("name is longer than %d characters", maxSnapshotName), http.StatusBadRequest)
	case utf8.RuneCountInString(req.Note) > maxSnapshotNote:
		http.Error(w, fmt.Sprintf("note is longer than %d characters", maxSnapshotNote), http.StatusBadRequest)
	default:
		return req, true
	}
	return req, false
}

func takenBy(r *http.Request) string {
	user, _ := r.Context().Value(userKey{}).(User)
	return user.Email
}

const noContractsToSnapshot = "no contracts are loaded, so there is nothing to snapshot"

// Postgres

func (s *pgVervent) snapshotRoutes(r chi.Router) {
	r.Get("/", s.snapshots.list)
	r.Post("/", s.handleCreateSnapshot)
	r.Get("/history", s.handleSnapshotHistory)
	r.Get("/contracts", s.snapshotContracts.list)
	r.Get("/{id}", s.snapshots.get)
	r.Get("/{id}/portfolios", s.handleSnapshotPortfolios)
	r.Get("/{id}/contracts/{contract}", s.handleSnapshotContract)
}

// snapshotRowTotals totals portfolio_snapshot_contracts rows (alias c) by the formulas of
// portfolio.Capture, in the order of snapshotDay's fields.
const snapshotRowTotals = `count(*),
		       count(*) FILTER (WHERE c.is_open),
		       coalesce(sum(c.outstanding_receivables) FILTER (WHERE c.is_open), 0)::float8,
		       coalesce(sum(c.past_due) FILTER (WHERE c.is_open), 0)::float8,
		       count(*) FILTER (WHERE c.is_open AND c.days_delinquent > 0)`

// handleSnapshotHistory answers with the totals frozen on each daily snapshot, or for one
// portfolio with the totals of its rows in each; a day the portfolio has no rows in is left out.
func (s *pgVervent) handleSnapshotHistory(w http.ResponseWriter, r *http.Request) {
	days := []snapshotDay{}
	if s.snapshots.db == nil { // the snapshot tables don't exist yet
		writeJSON(w, days)
		return
	}
	query, args := `
		SELECT id, as_of::text, total_contracts, active_contracts, outstanding_receivables::float8,
		       past_due::float8, delinquent_contracts
		  FROM portfolio_snapshots WHERE kind = 'daily' ORDER BY as_of`, []any{}
	if name := r.URL.Query().Get("portfolio"); name != "" {
		query, args = `
		SELECT c.snapshot_id, c.as_of::text, `+snapshotRowTotals+`
		  FROM portfolio_snapshot_contracts c
		 WHERE c.kind = 'daily' AND c.portfolio = $1
		 GROUP BY c.snapshot_id, c.as_of ORDER BY c.as_of`, []any{name}
	}
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		serverError(w, err)
		return
	}
	var d snapshotDay
	_, err = pgx.ForEachRow(rows, []any{&d.SnapshotID, &d.AsOf, &d.TotalContracts, &d.ActiveContracts,
		&d.OutstandingReceivables, &d.PastDue, &d.DelinquentContracts}, func() error {
		days = append(days, d.finish())
		return nil
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, days)
}

func (s *pgVervent) handleSnapshotPortfolios(w http.ResponseWriter, r *http.Request) {
	totals := []portfolioTotals{}
	if s.snapshots.db == nil {
		writeJSON(w, totals)
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT c.portfolio, c.snapshot_id, c.as_of::text, `+snapshotRowTotals+`
		  FROM portfolio_snapshot_contracts c
		 WHERE c.snapshot_id::text = $1
		 GROUP BY c.portfolio, c.snapshot_id, c.as_of ORDER BY c.portfolio NULLS LAST`, chi.URLParam(r, "id"))
	if err != nil {
		serverError(w, err)
		return
	}
	var t portfolioTotals
	_, err = pgx.ForEachRow(rows, []any{&t.Portfolio, &t.SnapshotID, &t.AsOf, &t.TotalContracts, &t.ActiveContracts,
		&t.OutstandingReceivables, &t.PastDue, &t.DelinquentContracts}, func() error {
		t.snapshotDay = t.finish()
		totals = append(totals, t)
		return nil
	})
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, totals)
}

// handleCreateSnapshot copies the vervent_contracts rows of Camber's leases as they stand into a
// manual snapshot, in one transaction, and answers with the new snapshot.
func (s *pgVervent) handleCreateSnapshot(w http.ResponseWriter, r *http.Request) {
	req, ok := readSnapshotRequest(w, r)
	if !ok {
		return
	}
	if s.snapshots.db == nil {
		http.Error(w, "the snapshot tables don't exist; apply portfolio/sql first", http.StatusServiceUnavailable)
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback(ctx)

	// The data is as of the newest file any contract came from.
	var asOf *string
	if err := tx.QueryRow(ctx, `SELECT max(file_date)::text FROM vervent_contracts`).Scan(&asOf); err != nil {
		serverError(w, err)
		return
	}
	if asOf == nil {
		http.Error(w, noContractsToSnapshot, http.StatusConflict)
		return
	}
	id, _, err := portfolio.Capture(ctx, tx, portfolio.Vervent("vervent_contracts"), portfolio.Snapshot{
		Kind: portfolio.Manual, AsOf: *asOf, Name: req.Name, Note: req.Note, TakenBy: takenBy(r)})
	if errors.Is(err, portfolio.ErrNoLeases) {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	var body string
	if err := tx.QueryRow(ctx, `SELECT row_to_json(t)::text FROM portfolio_snapshots t WHERE id = $1`, id).Scan(&body); err != nil {
		serverError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		serverError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(body))
}

func (s *pgVervent) handleSnapshotContract(w http.ResponseWriter, r *http.Request) {
	if s.snapshots.db == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var body string
	err := s.db.QueryRow(r.Context(), `SELECT row_to_json(t)::text FROM portfolio_snapshot_contracts t
		WHERE snapshot_id::text = $1 AND contract_no = $2`, chi.URLParam(r, "id"), chi.URLParam(r, "contract")).Scan(&body)
	if err == pgx.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(body))
}

// Mock

func (s *verventStore) snapshotRoutes(r chi.Router) {
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		snapshots, _ := s.snapshotData()
		snapshots.list(w, r)
	})
	r.Post("/", s.handleCreateSnapshot)
	r.Get("/history", s.handleSnapshotHistory)
	r.Get("/contracts", func(w http.ResponseWriter, r *http.Request) {
		_, contracts := s.snapshotData()
		contracts.list(w, r)
	})
	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		snapshots, _ := s.snapshotData()
		snapshots.get(w, r)
	})
	r.Get("/{id}/portfolios", s.handleSnapshotPortfolios)
	r.Get("/{id}/contracts/{contract}", s.handleSnapshotContract)
}

// snapshotData returns the snapshot datasets as they are now. A dataset is never changed in
// place (handleCreateSnapshot swaps in new ones), so the copies can be read without the lock.
func (s *verventStore) snapshotData() (snapshots, contracts dataset) {
	s.snapshotMu.RLock()
	defer s.snapshotMu.RUnlock()
	return s.snapshots, s.snapshotContracts
}

func (s *verventStore) handleSnapshotHistory(w http.ResponseWriter, r *http.Request) {
	snapshots, contracts := s.snapshotData()
	days := []snapshotDay{}
	if name := r.URL.Query().Get("portfolio"); name != "" {
		byID := map[string]*snapshotDay{}
		for _, rw := range contracts.rows {
			if rw["kind"] != portfolio.Daily || rw["portfolio"] != name {
				continue
			}
			id := str(rw["snapshot_id"])
			if byID[id] == nil {
				asOf, _ := rw["as_of"].(string)
				byID[id] = &snapshotDay{SnapshotID: int64(num(rw["snapshot_id"])), AsOf: asOf}
			}
			byID[id].add(rw)
		}
		for _, d := range byID {
			days = append(days, d.finish())
		}
		slices.SortFunc(days, func(a, b snapshotDay) int { return strings.Compare(a.AsOf, b.AsOf) })
		writeJSON(w, days)
		return
	}
	for _, sn := range snapshots.rows {
		if sn["kind"] != portfolio.Daily {
			continue
		}
		asOf, _ := sn["as_of"].(string)
		days = append(days, snapshotDay{
			SnapshotID:             int64(num(sn["id"])),
			AsOf:                   asOf,
			TotalContracts:         int(num(sn["total_contracts"])),
			ActiveContracts:        int(num(sn["active_contracts"])),
			OutstandingReceivables: num(sn["outstanding_receivables"]),
			PastDue:                num(sn["past_due"]),
			DelinquentContracts:    int(num(sn["delinquent_contracts"])),
		}.finish())
	}
	slices.SortFunc(days, func(a, b snapshotDay) int { return strings.Compare(a.AsOf, b.AsOf) })
	writeJSON(w, days)
}

func (s *verventStore) handleSnapshotPortfolios(w http.ResponseWriter, r *http.Request) {
	_, contracts := s.snapshotData()
	id := chi.URLParam(r, "id")
	byName := map[string]*portfolioTotals{} // "" for the rows without a portfolio
	for _, rw := range contracts.rows {
		if str(rw["snapshot_id"]) != id {
			continue
		}
		name, named := rw["portfolio"].(string)
		t := byName[name]
		if t == nil {
			asOf, _ := rw["as_of"].(string)
			t = &portfolioTotals{snapshotDay: snapshotDay{SnapshotID: int64(num(rw["snapshot_id"])), AsOf: asOf}}
			if named {
				t.Portfolio = &name
			}
			byName[name] = t
		}
		t.add(rw)
	}
	totals := []portfolioTotals{}
	for _, name := range slices.Sorted(maps.Keys(byName)) {
		t := byName[name]
		t.snapshotDay = t.finish()
		totals = append(totals, *t)
	}
	// Sorted by name, which put the rows without a portfolio first; they go last.
	if len(totals) > 0 && totals[0].Portfolio == nil {
		totals = append(totals[1:], totals[0])
	}
	writeJSON(w, totals)
}

// handleCreateSnapshot does what portfolio.Capture does in SQL, over the mock contracts. The
// snapshot lasts until the process exits.
func (s *verventStore) handleCreateSnapshot(w http.ResponseWriter, r *http.Request) {
	req, ok := readSnapshotRequest(w, r)
	if !ok {
		return
	}
	s.snapshotMu.Lock()
	defer s.snapshotMu.Unlock()

	asOf := ""
	for _, c := range s.contracts.rows {
		if d, _ := c["file_date"].(string); d > asOf {
			asOf = d
		}
	}
	if asOf == "" {
		http.Error(w, noContractsToSnapshot, http.StatusConflict)
		return
	}
	var last int64
	for _, sn := range s.snapshots.rows {
		last = max(last, int64(num(sn["id"])))
	}
	id := json.Number(strconv.FormatInt(last+1, 10))

	var total snapshotDay
	contracts := make([]row, 0, len(s.contracts.rows))
	for _, c := range s.contracts.rows {
		if !rowInPortfolio(c, "") {
			continue
		}
		rw := row{"snapshot_id": id, "as_of": asOf, "kind": portfolio.Manual, "portfolio": c["camber_portfolio"]}
		for _, m := range portfolio.Vervent("").Columns {
			rw[m.Column] = c[m.From]
		}
		contracts = append(contracts, rw)
		total.add(rw)
	}
	if len(contracts) == 0 {
		http.Error(w, portfolio.ErrNoLeases.Error(), http.StatusConflict)
		return
	}
	slices.SortFunc(contracts, func(a, b row) int { return strings.Compare(str(a["contract_no"]), str(b["contract_no"])) })

	amount := func(f float64) json.Number { return json.Number(strconv.FormatFloat(round2(f), 'f', 2, 64)) }
	var note any
	if req.Note != "" {
		note = req.Note
	}
	snapshot := row{
		"id": id, "kind": portfolio.Manual, "as_of": asOf, "name": req.Name, "note": note,
		"taken_at": time.Now().UTC().Format(time.RFC3339), "taken_by": takenBy(r),
		"servicer": "vervent", "source_file": nil,
		"total_contracts":         json.Number(strconv.Itoa(total.TotalContracts)),
		"active_contracts":        json.Number(strconv.Itoa(total.ActiveContracts)),
		"outstanding_receivables": amount(total.OutstandingReceivables),
		"past_due":                amount(total.PastDue),
		"delinquent_contracts":    json.Number(strconv.Itoa(total.DelinquentContracts)),
	}

	// Newest first, the order the lists are served in. New slices and a new map: handlers may
	// still be reading the old ones.
	byKey := maps.Clone(s.snapshots.byKey)
	byKey[id.String()] = snapshot
	s.snapshots = dataset{name: s.snapshots.name, cols: s.snapshots.cols,
		rows: append([]row{snapshot}, s.snapshots.rows...), byKey: byKey}
	s.snapshotContracts = dataset{name: s.snapshotContracts.name, cols: s.snapshotContracts.cols,
		rows: append(contracts, s.snapshotContracts.rows...)}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(snapshot)
}

// handleSnapshotContract returns one contract row of a snapshot. The mock files don't carry
// servicer_row (some 200 fields per contract per snapshot), so it is filled with the contract as
// the mock has it now, which a real snapshot would have frozen.
func (s *verventStore) handleSnapshotContract(w http.ResponseWriter, r *http.Request) {
	_, contracts := s.snapshotData()
	id, contract := chi.URLParam(r, "id"), chi.URLParam(r, "contract")
	for _, rw := range contracts.rows {
		if str(rw["snapshot_id"]) != id || rw["contract_no"] != contract {
			continue
		}
		out := maps.Clone(rw)
		out["servicer_row"] = nil
		if c, ok := s.contracts.byKey[contract]; ok {
			servicerRow := maps.Clone(c)
			delete(servicerRow, "loaded_at")
			out["servicer_row"] = servicerRow
		}
		writeJSON(w, out)
		return
	}
	http.Error(w, "not found", http.StatusNotFound)
}
