package main

import (
	"cmp"
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
)

const (
	searchMinLength = 2 // shorter queries match too much to be useful
	searchLimit     = 8 // per group
)

// searchResults is the /api/search?q= response: records whose lease number or VIN contains q,
// ignoring case, values that start with q first. Each group holds at most searchLimit rows with
// just the columns the search box shows.
type searchResults struct {
	Contracts []json.RawMessage `json:"contracts"` // lease_no, lessee_name, account_status
	Assets    []json.RawMessage `json:"assets"`    // asset_no, serial_number, description, lease
	Lots      []json.RawMessage `json:"lots"`      // copart_inventory: lot_nbr, vin, year, make, model
}

func searchQuery(r *http.Request) string {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < searchMinLength {
		return ""
	}
	return q
}

func (s *pgVervent) handleSearch(w http.ResponseWriter, r *http.Request) {
	res := searchResults{Contracts: []json.RawMessage{}, Assets: []json.RawMessage{}, Lots: []json.RawMessage{}}
	q := searchQuery(r)
	if q == "" {
		writeJSON(w, res)
		return
	}
	for _, g := range []struct {
		dst                  *[]json.RawMessage
		table, match, fields string
	}{
		{&res.Contracts, "vervent_contracts", "lease_no", "lease_no, lessee_name, account_status"},
		{&res.Assets, "vervent_assets", "serial_number", "asset_no, serial_number, description, lease"},
		{&res.Lots, "copart_inventory", "vin", "lot_nbr, vin, year, make, model"},
	} {
		rows, err := s.search(r.Context(), g.table, g.match, g.fields, q)
		if err != nil {
			serverError(w, err)
			return
		}
		*g.dst = append(*g.dst, rows...)
	}
	writeJSON(w, res)
}

// search returns the rows of table whose match column contains q. strpos rather than LIKE, so
// % and _ in q are literal.
func (s *pgVervent) search(ctx context.Context, table, match, fields, q string) ([]json.RawMessage, error) {
	rows, err := s.db.Query(ctx, `
		SELECT row_to_json(t)::text
		  FROM (SELECT `+fields+` FROM `+table+`
		         WHERE strpos(upper(`+match+`), upper($1)) > 0
		         ORDER BY strpos(upper(`+match+`), upper($1)) > 1, `+match+`
		         LIMIT $2) t`, q, searchLimit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (json.RawMessage, error) {
		var s string
		err := row.Scan(&s)
		return json.RawMessage(s), err
	})
}

// handleSearch mirrors pgVervent.handleSearch over the mock data, which has no Copart lots.
func (s *verventStore) handleSearch(w http.ResponseWriter, r *http.Request) {
	res := searchResults{Contracts: []json.RawMessage{}, Assets: []json.RawMessage{}, Lots: []json.RawMessage{}}
	if q := searchQuery(r); q != "" {
		res.Contracts = s.contracts.search("lease_no", q, "lease_no", "lessee_name", "account_status")
		res.Assets = s.assets.search("serial_number", q, "asset_no", "serial_number", "description", "lease")
	}
	writeJSON(w, res)
}

func (d dataset) search(match, q string, fields ...string) []json.RawMessage {
	q = strings.ToUpper(q)
	type hit struct {
		prefix bool
		value  string
		row    row
	}
	var hits []hit
	for _, rw := range d.rows {
		v, _ := rw[match].(string)
		if i := strings.Index(strings.ToUpper(v), q); i >= 0 {
			hits = append(hits, hit{i == 0, v, rw})
		}
	}
	slices.SortStableFunc(hits, func(a, b hit) int {
		if a.prefix != b.prefix {
			if a.prefix {
				return -1
			}
			return 1
		}
		return cmp.Compare(a.value, b.value)
	})
	out := []json.RawMessage{}
	for _, h := range hits[:min(len(hits), searchLimit)] {
		picked := make(row, len(fields))
		for _, f := range fields {
			picked[f] = h.row[f]
		}
		b, _ := json.Marshal(picked)
		out = append(out, b)
	}
	return out
}
