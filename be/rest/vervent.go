package main

import (
	"cmp"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	defaultVerventMockDir = "../../vervent/mock"
	defaultPageLimit      = 100
	maxPageLimit          = 1000
)

type row = map[string]any

// dataset is one Vervent table loaded from mock JSON, indexed by its primary key.
type dataset struct {
	rows  []row
	byKey map[string]row
}

type verventStore struct {
	contracts    dataset
	assets       dataset
	transactions dataset
}

func loadVervent(dir string) (*verventStore, error) {
	var s verventStore
	for _, d := range []struct {
		file string
		key  string
		dst  *dataset
	}{
		{"contracts.json", "lease_no", &s.contracts},
		{"assets.json", "asset_no", &s.assets},
		{"transactions.json", "transaction_key", &s.transactions},
	} {
		ds, err := loadDataset(filepath.Join(dir, d.file), d.key)
		if err != nil {
			return nil, err
		}
		*d.dst = ds
	}
	return &s, nil
}

func loadDataset(path, key string) (dataset, error) {
	f, err := os.Open(path)
	if err != nil {
		return dataset{}, err
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	dec.UseNumber() // keep keys like account_key and decimals exactly as written
	var rows []row
	if err := dec.Decode(&rows); err != nil {
		return dataset{}, fmt.Errorf("decoding %s: %w", path, err)
	}
	byKey := make(map[string]row, len(rows))
	for _, r := range rows {
		byKey[str(r[key])] = r
	}
	return dataset{rows: rows, byKey: byKey}, nil
}

func (s *verventStore) routes(r chi.Router) {
	r.Get("/metrics", s.handleMetrics)
	r.Get("/contracts", s.contracts.list)
	r.Get("/contracts/{id}", s.contracts.get)
	r.Get("/assets", s.assets.list)
	r.Get("/assets/{id}", s.assets.get)
	r.Get("/transactions", s.transactions.list)
	r.Get("/transactions/{id}", s.transactions.get)
}

// list returns a page of rows. sort=col orders ascending and sort=-col descending, with nulls
// last either way. Any other query parameter except limit/offset filters on the column of that
// name by exact match, e.g. /transactions?contract_number=5000080213&trans=200.
func (d dataset) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, err := intParam(q.Get("limit"), defaultPageLimit)
	if err != nil || limit < 1 || limit > maxPageLimit {
		http.Error(w, fmt.Sprintf("limit must be between 1 and %d", maxPageLimit), http.StatusBadRequest)
		return
	}
	offset, err := intParam(q.Get("offset"), 0)
	if err != nil || offset < 0 {
		http.Error(w, "offset must be a non-negative integer", http.StatusBadRequest)
		return
	}
	sortCol, desc := strings.CutPrefix(q.Get("sort"), "-")
	if sortCol != "" && len(d.rows) > 0 {
		if _, ok := d.rows[0][sortCol]; !ok {
			http.Error(w, "unknown sort column "+sortCol, http.StatusBadRequest)
			return
		}
	}
	q.Del("limit")
	q.Del("offset")
	q.Del("sort")

	matched := make([]row, 0)
	for _, rw := range d.rows {
		if matches(rw, q) {
			matched = append(matched, rw)
		}
	}
	if sortCol != "" {
		slices.SortStableFunc(matched, func(a, b row) int {
			return compareValues(a[sortCol], b[sortCol], desc)
		})
	}
	page := matched[min(offset, len(matched)):min(offset+limit, len(matched))]

	writeJSON(w, map[string]any{
		"total":  len(matched),
		"limit":  limit,
		"offset": offset,
		"data":   page,
	})
}

func (d dataset) get(w http.ResponseWriter, r *http.Request) {
	rw, ok := d.byKey[chi.URLParam(r, "id")]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, rw)
}

func matches(rw row, filters map[string][]string) bool {
	for col, want := range filters {
		v, ok := rw[col]
		if !ok || str(v) != want[0] {
			return false
		}
	}
	return true
}

// compareValues orders numbers numerically, strings (including ISO dates) lexically and
// false before true. Nulls sort last regardless of direction.
func compareValues(a, b any, desc bool) int {
	switch {
	case a == nil && b == nil:
		return 0
	case a == nil:
		return 1
	case b == nil:
		return -1
	}
	c := cmp.Compare(str(a), str(b)) // fallback when a column mixes types
	switch av := a.(type) {
	case json.Number:
		if bv, ok := b.(json.Number); ok {
			af, _ := av.Float64()
			bf, _ := bv.Float64()
			c = cmp.Compare(af, bf)
		}
	case bool:
		if bv, ok := b.(bool); ok && av != bv {
			c = map[bool]int{false: -1, true: 1}[av]
		}
	}
	if desc {
		return -c
	}
	return c
}

// str renders a JSON value the way it would appear in a query string; null becomes "null".
func str(v any) string {
	if v == nil {
		return "null"
	}
	return fmt.Sprint(v)
}

func intParam(s string, fallback int) (int, error) {
	if s == "" {
		return fallback, nil
	}
	return strconv.Atoi(s)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
