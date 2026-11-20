package main

import (
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
)

const (
	defaultVerventMockDir = "../../vervent/mock"
	defaultPageLimit      = 100
	maxPageLimit          = 1000
)

type row = map[string]any

// dataset is one table or view loaded from mock JSON, indexed by its primary key.
type dataset struct {
	name  string   // the table the rows mock, which names an export
	cols  []string // the columns in file order, for exports
	rows  []row
	byKey map[string]row
}

type verventStore struct {
	contracts    dataset
	assets       dataset
	transactions dataset
	loadRuns     dataset
	loadFiles    dataset
	// Portfolio snapshots (snapshots.go). Taking a snapshot replaces both datasets under
	// snapshotMu; their handlers read them through snapshotData.
	snapshotMu        sync.RWMutex
	snapshots         dataset
	snapshotContracts dataset // byKey is unused: contract_no repeats per snapshot
	terminations      dataset // the lease_terminations view, without Copart data
	portfolios        dataset
}

func loadVervent(dir string) (*verventStore, error) {
	var s verventStore
	for _, d := range []struct {
		file  string
		table string
		key   string
		dst   *dataset
	}{
		{"contracts.json", "vervent_contract_list", "lease_no", &s.contracts},
		{"assets.json", "vervent_asset_list", "asset_no", &s.assets},
		{"transactions.json", "vervent_transaction_list", "transaction_key", &s.transactions},
		{"load_runs.json", "load_runs", "id", &s.loadRuns},
		{"load_files.json", "load_files", "id", &s.loadFiles},
		{"portfolio_snapshots.json", "portfolio_snapshots", "id", &s.snapshots},
		{"portfolio_snapshot_contracts.json", "portfolio_snapshot_contract_list", "contract_no", &s.snapshotContracts},
		{"lease_terminations.json", "lease_terminations", "lease_no", &s.terminations},
		{"portfolios.json", "portfolios", "name", &s.portfolios},
	} {
		ds, err := loadDataset(filepath.Join(dir, d.file), d.key)
		if err != nil {
			return nil, err
		}
		ds.name = d.table
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
	cols, err := firstRowKeys(f)
	if err != nil {
		return dataset{}, fmt.Errorf("decoding %s: %w", path, err)
	}
	return dataset{cols: cols, rows: rows, byKey: byKey}, nil
}

// firstRowKeys returns the keys of the first object of a JSON array of objects in the order they
// are written, which decoding into a map loses.
func firstRowKeys(f *os.File) ([]string, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	dec := json.NewDecoder(f)
	if _, err := dec.Token(); err != nil { // [
		return nil, err
	}
	if !dec.More() {
		return nil, nil
	}
	if _, err := dec.Token(); err != nil { // {
		return nil, err
	}
	var keys []string
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			return nil, err
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return nil, err
		}
		keys = append(keys, key.(string))
	}
	return keys, nil
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

// copartRoutes serves empty lists; Copart data only exists in Postgres.
func (s *verventStore) copartRoutes(r chi.Router) {
	r.Get("/inventory", dataset{}.list)
	r.Get("/inventory/{id}", dataset{}.get)
	r.Get("/sales", dataset{}.list)
	r.Get("/sales/{id}", dataset{}.get)
	r.Get("/vs-vervent", dataset{}.list)
	r.Get("/vs-vervent/summary", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, []any{}) })
	r.Get("/vs-vervent/{id}", dataset{}.get)
}

func (s *verventStore) portfolioRoutes(r chi.Router) {
	r.Get("/", s.portfolios.list)
}

func (s *verventStore) servicingRoutes(r chi.Router) {
	r.Get("/terminations", s.terminations.list)
	r.Get("/terminations/summary", s.handleTerminationSummary)
	r.Get("/terminations/{id}", s.terminations.get)
}

func (s *verventStore) loadRoutes(r chi.Router) {
	r.Get("/runs", s.loadRuns.list)
	r.Get("/runs/{id}", s.loadRuns.get)
	r.Get("/files", s.loadFiles.list)
	r.Get("/files/{id}", s.loadFiles.get)
	r.Get("/files/{id}/download", s.handleLoadFileDownload)
	r.Head("/files/{id}/download", s.handleLoadFileDownload)
}

func (s *verventStore) handleLoadFileDownload(w http.ResponseWriter, r *http.Request) {
	var name, sum string
	if f, ok := s.loadFiles.byKey[chi.URLParam(r, "id")]; ok {
		name, _ = f["source_file"].(string)
		sum, _ = f["sha256"].(string)
	}
	serveLoadFile(w, r, name, sum)
}

// filterOps are the comparisons a filter parameter can ask for with a suffix, e.g. days_del.gt=0,
// and their SQL operators. Without a suffix the filter is an exact match.
// like is the exception: it matches values containing the text, ignoring case, and has no operator.
var filterOps = map[string]string{"gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "ne": "IS DISTINCT FROM", "like": ""}

const tooManyRowsToExport = "too many rows to export; narrow the filters"

// splitFilter splits a filter parameter into its column and operator ("" for exact match).
func splitFilter(param string) (col, op string, ok bool) {
	col, op, found := strings.Cut(param, ".")
	if !found {
		return col, "", true
	}
	_, ok = filterOps[op]
	return col, op, ok
}

// list returns a page of rows. sort=col orders ascending and sort=-col descending, with nulls
// last either way. Any other query parameter except limit/offset filters on the column of that
// name by exact match, e.g. /transactions?contract_number=5000080213&trans=200, or with a
// filterOps suffix by comparison, e.g. /contracts?days_del.gt=0. col.ne also matches nulls.
// col.like matches values that contain the text, whatever the case.
// sum=col,col adds "sums": the total of each of those columns over every row the filters match.
// distinct=col,col adds "distinct": how many different values each of those columns has over them.
// format=xlsx answers with every matching row as a workbook instead (xlsx.go).
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
	sumCols := sumParam(q.Get("sum"))
	for _, col := range sumCols {
		if msg := d.checkSum(col); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}
	distinctCols := sumParam(q.Get("distinct"))
	for _, col := range distinctCols {
		if len(d.rows) > 0 {
			if _, ok := d.rows[0][col]; !ok {
				http.Error(w, "unknown distinct column "+col, http.StatusBadRequest)
				return
			}
		}
	}
	q.Del("limit")
	q.Del("offset")
	q.Del("sort")
	q.Del("sum")
	q.Del("distinct")
	export := q.Get("format") == "xlsx"
	q.Del("format")
	for param := range q {
		if _, _, ok := splitFilter(param); !ok {
			http.Error(w, "unknown filter operator in "+param, http.StatusBadRequest)
			return
		}
	}

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
	if export {
		d.export(w, matched)
		return
	}
	page := matched[min(offset, len(matched)):min(offset+limit, len(matched))]

	body := map[string]any{
		"total":  len(matched),
		"limit":  limit,
		"offset": offset,
		"data":   page,
	}
	if len(sumCols) > 0 {
		sums := make(map[string]float64, len(sumCols))
		for _, col := range sumCols {
			var total float64
			for _, rw := range matched {
				total += num(rw[col])
			}
			sums[col] = round2(total)
		}
		body["sums"] = sums
	}
	if len(distinctCols) > 0 {
		distinct := make(map[string]int, len(distinctCols))
		for _, col := range distinctCols {
			values := map[string]struct{}{}
			for _, rw := range matched {
				if rw[col] != nil { // like count(DISTINCT col), nulls don't count
					values[str(rw[col])] = struct{}{}
				}
			}
			distinct[col] = len(values)
		}
		body["distinct"] = distinct
	}
	writeJSON(w, body)
}

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// export writes rows as a workbook. The mock has no column types, so each value is written by
// what it is: numbers as numbers, YYYY-MM-DD strings as dates.
func (d dataset) export(w http.ResponseWriter, rows []row) {
	if len(rows) > maxExportRows {
		http.Error(w, tooManyRowsToExport, http.StatusBadRequest)
		return
	}
	x := startXLSX(w, d.name, d.cols)
	values := make([]*string, len(d.cols))
	kinds := make([]cellKind, len(d.cols))
	for _, rw := range rows {
		for i, col := range d.cols {
			values[i], kinds[i] = nil, cellText
			v := rw[col]
			if v == nil {
				continue
			}
			s := str(v)
			values[i] = &s
			if _, ok := v.(json.Number); ok {
				kinds[i] = cellNumber
			} else if isoDate.MatchString(s) {
				kinds[i] = cellDate
			}
		}
		x.row(values, kinds)
	}
	if err := x.close(); err != nil {
		log.Printf("export of %s: %v", d.name, err)
	}
}

// sumParam splits the sum parameter into its column names.
func sumParam(v string) []string {
	if v == "" {
		return nil
	}
	return strings.Split(v, ",")
}

// checkSum returns why col can't be summed ("" if it can): like Postgres, only a column that
// exists and holds numbers.
func (d dataset) checkSum(col string) string {
	for i, rw := range d.rows {
		v, ok := rw[col]
		if i == 0 && !ok {
			return "unknown sum column " + col
		}
		if _, isNum := v.(json.Number); v != nil && !isNum {
			return "sum needs numeric columns"
		}
	}
	return ""
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
	for param, want := range filters {
		col, op, _ := splitFilter(param)
		v, ok := rw[col]
		if !ok || !filterMatch(v, op, want[0]) {
			return false
		}
	}
	return true
}

// filterMatch applies one filter to a value. Comparisons are numeric for numbers and lexical
// otherwise (ISO dates order correctly); a null only ever satisfies ne.
func filterMatch(v any, op, want string) bool {
	switch op {
	case "":
		return str(v) == want
	case "ne":
		return str(v) != want
	case "like":
		return v != nil && strings.Contains(strings.ToLower(str(v)), strings.ToLower(want))
	}
	if v == nil {
		return false
	}
	c := cmp.Compare(str(v), want)
	if n, ok := v.(json.Number); ok {
		f, _ := n.Float64()
		w, err := strconv.ParseFloat(want, 64)
		if err != nil {
			return false
		}
		c = cmp.Compare(f, w)
	}
	switch op {
	case "gt":
		return c > 0
	case "gte":
		return c >= 0
	case "lt":
		return c < 0
	default:
		return c <= 0
	}
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
