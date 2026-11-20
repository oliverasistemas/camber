package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgTable serves one table or view with the same API as the mock dataset: rows come back as
// row_to_json, so the JSON matches what generate_mock.py writes.
type pgTable struct {
	db      *pgxpool.Pool
	name    string
	key     string
	columns map[string]bool // whitelist for sort and filter column names
	ordered []pgColumn      // the columns in table order, for exports
	order   string          // default ORDER BY and tie-break for a requested sort; the key if empty
}

type pgVervent struct {
	db *pgxpool.Pool
	// The vervent_*_list views: the tables with camber_portfolio (vervent/sql/05_portfolio_views.sql).
	contracts, assets, transactions pgTable
	copartInventory, copartSales    pgTable
	copartVsVervent                 pgTable // a view
	loadRuns, loadFiles             pgTable // optional: left empty until 04_load_history.sql is applied
	// Portfolio snapshots (snapshots.go); optional: left empty until portfolio/sql is applied.
	// snapshotContracts is the portfolio_snapshot_contract_list view.
	snapshots, snapshotContracts pgTable
	terminations                 pgTable // a view; optional: left empty until 04_lease_terminations.sql is applied
	portfolios                   pgTable // optional: left empty until portfolio/sql/02_portfolios.sql is applied
}

func openPGVervent(ctx context.Context, dsn string) (*pgVervent, error) {
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	s := &pgVervent{db: db}
	for _, t := range []struct {
		name, key string
		dst       *pgTable
		optional  bool
	}{
		{"vervent_contract_list", "lease_no", &s.contracts, false},
		{"vervent_asset_list", "asset_no", &s.assets, false},
		{"vervent_transaction_list", "transaction_key", &s.transactions, false},
		{"copart_inventory", "lot_nbr", &s.copartInventory, false},
		{"copart_sales", "lot_nbr", &s.copartSales, false},
		{"copart_vs_vervent", "lot_nbr", &s.copartVsVervent, false},
		{"load_runs", "id", &s.loadRuns, true},
		{"load_files", "id", &s.loadFiles, true},
		{"portfolio_snapshots", "id", &s.snapshots, true},
		{"portfolio_snapshot_contract_list", "contract_no", &s.snapshotContracts, true},
		{"lease_terminations", "lease_no", &s.terminations, true},
		{"portfolios", "name", &s.portfolios, true},
	} {
		cols, err := tableColumns(ctx, db, t.name)
		if err != nil {
			db.Close()
			return nil, err
		}
		if len(cols) == 0 && t.optional {
			log.Printf("table %s not found; its endpoints serve empty lists", t.name)
			continue
		}
		if len(cols) == 0 {
			db.Close()
			return nil, fmt.Errorf("table %s not found; run deploy/load-schema.sh first", t.name)
		}
		names := make(map[string]bool, len(cols))
		for _, c := range cols {
			names[c.name] = true
		}
		*t.dst = pgTable{db: db, name: t.name, key: t.key, columns: names, ordered: cols}
	}
	// Newest first, as generate_mock.py writes the mock rows.
	s.snapshots.order = `"as_of" DESC, "id" DESC`
	s.snapshotContracts.order = `"as_of" DESC, "snapshot_id" DESC, "contract_no"`
	return s, nil
}

// pgColumn is a table column and how an export writes its values.
type pgColumn struct {
	name string
	kind cellKind
}

// tableColumns returns the table's (or view's) columns in table order; none if it doesn't exist.
func tableColumns(ctx context.Context, db *pgxpool.Pool, table string) ([]pgColumn, error) {
	rows, err := db.Query(ctx, `SELECT column_name, data_type FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, table)
	if err != nil {
		return nil, err
	}
	var cols []pgColumn
	var name, dataType string
	_, err = pgx.ForEachRow(rows, []any{&name, &dataType}, func() error {
		c := pgColumn{name: name}
		switch dataType {
		case "smallint", "integer", "bigint", "numeric", "real", "double precision":
			c.kind = cellNumber
		case "date":
			c.kind = cellDate
		}
		cols = append(cols, c)
		return nil
	})
	return cols, err
}

func (s *pgVervent) routes(r chi.Router) {
	r.Get("/metrics", s.handleMetrics)
	r.Get("/contracts", s.contracts.list)
	r.Get("/contracts/{id}", s.contracts.get)
	r.Get("/assets", s.assets.list)
	r.Get("/assets/{id}", s.assets.get)
	r.Get("/transactions", s.transactions.list)
	r.Get("/transactions/{id}", s.transactions.get)
}

func (s *pgVervent) copartRoutes(r chi.Router) {
	r.Get("/inventory", s.copartInventory.list)
	r.Get("/inventory/{id}", s.copartInventory.get)
	r.Get("/sales", s.copartSales.list)
	r.Get("/sales/{id}", s.copartSales.get)
	r.Get("/vs-vervent", s.copartVsVervent.list)
	r.Get("/vs-vervent/summary", s.handleComparisonSummary)
	r.Get("/vs-vervent/{id}", s.copartVsVervent.get)
}

func (s *pgVervent) portfolioRoutes(r chi.Router) {
	r.Get("/", s.portfolios.list)
}

func (s *pgVervent) servicingRoutes(r chi.Router) {
	r.Get("/terminations", s.terminations.list)
	r.Get("/terminations/summary", s.handleTerminationSummary)
	r.Get("/terminations/{id}", s.terminations.get)
}

func (s *pgVervent) loadRoutes(r chi.Router) {
	r.Get("/runs", s.loadRuns.list)
	r.Get("/runs/{id}", s.loadRuns.get)
	r.Get("/files", s.loadFiles.list)
	r.Get("/files/{id}", s.loadFiles.get)
	r.Get("/files/{id}/download", s.handleLoadFileDownload)
	r.Head("/files/{id}/download", s.handleLoadFileDownload)
}

func (s *pgVervent) handleLoadFileDownload(w http.ResponseWriter, r *http.Request) {
	var name, sum string
	if s.loadFiles.db != nil {
		err := s.db.QueryRow(r.Context(), `SELECT source_file, coalesce(sha256, '') FROM load_files WHERE id::text = $1`,
			chi.URLParam(r, "id")).Scan(&name, &sum)
		if err != nil && err != pgx.ErrNoRows {
			serverError(w, err)
			return
		}
	}
	serveLoadFile(w, r, name, sum)
}

// comparisonGroup totals copart_vs_vervent by comparison outcome (match, differs, ...).
type comparisonGroup struct {
	Comparison string  `json:"comparison"`
	Sales      int     `json:"sales"`
	CopartNet  float64 `json:"copart_net"`
	VerventNet float64 `json:"vervent_net"`
	Difference float64 `json:"difference"`
}

func (s *pgVervent) handleComparisonSummary(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT comparison, count(*), coalesce(sum(net_sale_proceeds), 0)::float8,
		       coalesce(sum(vervent_sale_proceeds), 0)::float8, coalesce(sum(difference), 0)::float8
		  FROM copart_vs_vervent GROUP BY 1 ORDER BY 1`)
	if err != nil {
		serverError(w, err)
		return
	}
	groups, err := pgx.CollectRows(rows, pgx.RowToStructByPos[comparisonGroup])
	if err != nil {
		serverError(w, err)
		return
	}
	if groups == nil {
		groups = []comparisonGroup{}
	}
	writeJSON(w, groups)
}

// list mirrors dataset.list: limit/offset paging, sort=col or sort=-col with nulls last, and any
// other parameter filters on that column by exact match of its text form ("null" matches NULL)
// or, with a filterOps suffix, by comparison in the column's own type.
// sum=col,col adds "sums": the total of each of those columns over every row the filters match.
// distinct=col,col adds "distinct": how many different values each of those columns has over them.
// format=xlsx answers with every matching row as a workbook instead (xlsx.go).
// Column names are checked against the table's columns and values are bound, never interpolated.
func (t pgTable) list(w http.ResponseWriter, r *http.Request) {
	if t.db == nil { // an optional table that doesn't exist
		dataset{}.list(w, r)
		return
	}
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
	if sortCol != "" && !t.columns[sortCol] {
		http.Error(w, "unknown sort column "+sortCol, http.StatusBadRequest)
		return
	}
	sumCols := sumParam(q.Get("sum"))
	for _, col := range sumCols {
		if !t.columns[col] {
			http.Error(w, "unknown sum column "+col, http.StatusBadRequest)
			return
		}
	}
	distinctCols := sumParam(q.Get("distinct"))
	for _, col := range distinctCols {
		if !t.columns[col] {
			http.Error(w, "unknown distinct column "+col, http.StatusBadRequest)
			return
		}
	}
	q.Del("limit")
	q.Del("offset")
	q.Del("sort")
	q.Del("sum")
	q.Del("distinct")
	export := q.Get("format") == "xlsx"
	q.Del("format")

	var where []string
	var args []any
	for param, vals := range q {
		col, op, ok := splitFilter(param)
		if !ok {
			http.Error(w, "unknown filter operator in "+param, http.StatusBadRequest)
			return
		}
		if !t.columns[col] {
			http.Error(w, "unknown filter column "+col, http.StatusBadRequest)
			return
		}
		ident := pgx.Identifier{col}.Sanitize()
		if vals[0] == "null" && op == "" {
			where = append(where, ident+" IS NULL")
			continue
		}
		if vals[0] == "null" && op == "ne" {
			where = append(where, ident+" IS NOT NULL")
			continue
		}
		args = append(args, vals[0])
		if op == "" {
			where = append(where, fmt.Sprintf("%s::text = $%d", ident, len(args)))
		} else if op == "like" {
			where = append(where, fmt.Sprintf("position(lower($%d) in lower(%s::text)) > 0", len(args), ident))
		} else {
			where = append(where, fmt.Sprintf("%s %s $%d", ident, filterOps[op], len(args)))
		}
	}
	from := pgx.Identifier{t.name}.Sanitize() + " t"
	if len(where) > 0 {
		from += " WHERE " + strings.Join(where, " AND ")
	}
	order := pgx.Identifier{t.key}.Sanitize()
	if t.order != "" {
		order = t.order
	}
	if sortCol != "" {
		dir := "ASC"
		if desc {
			dir = "DESC"
		}
		order = fmt.Sprintf("%s %s NULLS LAST, %s", pgx.Identifier{sortCol}.Sanitize(), dir, order)
	}

	ctx := r.Context()
	var total int
	sums := make([]float64, len(sumCols))
	aggregates, dest := "count(*)", []any{&total}
	for i, col := range sumCols {
		aggregates += fmt.Sprintf(", coalesce(sum(%s), 0)::float8", pgx.Identifier{col}.Sanitize())
		dest = append(dest, &sums[i])
	}
	distinct := make([]int, len(distinctCols))
	for i, col := range distinctCols {
		aggregates += fmt.Sprintf(", count(DISTINCT %s)", pgx.Identifier{col}.Sanitize())
		dest = append(dest, &distinct[i])
	}
	if err := t.db.QueryRow(ctx, "SELECT "+aggregates+" FROM "+from, args...).Scan(dest...); err != nil {
		var pgErr *pgconn.PgError
		// Class 22 is a data exception: a comparison value that doesn't parse as the column's type.
		if errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Code, "22") {
			http.Error(w, "invalid filter value", http.StatusBadRequest)
			return
		}
		// 42883: there is no sum() for the column's type.
		if errors.As(err, &pgErr) && pgErr.Code == "42883" && len(sumCols) > 0 {
			http.Error(w, "sum needs numeric columns", http.StatusBadRequest)
			return
		}
		serverError(w, err)
		return
	}
	if export {
		t.export(w, r, total, from, order, args)
		return
	}
	rows, err := t.db.Query(ctx, fmt.Sprintf("SELECT row_to_json(t)::text FROM %s ORDER BY %s LIMIT %d OFFSET %d",
		from, order, limit, offset), args...)
	if err != nil {
		serverError(w, err)
		return
	}
	page, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (json.RawMessage, error) {
		var s string
		err := row.Scan(&s)
		return json.RawMessage(s), err
	})
	if err != nil {
		serverError(w, err)
		return
	}
	if page == nil {
		page = []json.RawMessage{}
	}
	body := map[string]any{"total": total, "limit": limit, "offset": offset, "data": page}
	if len(sumCols) > 0 {
		named := make(map[string]float64, len(sumCols))
		for i, col := range sumCols {
			named[col] = sums[i]
		}
		body["sums"] = named
	}
	if len(distinctCols) > 0 {
		named := make(map[string]int, len(distinctCols))
		for i, col := range distinctCols {
			named[col] = distinct[i]
		}
		body["distinct"] = named
	}
	writeJSON(w, body)
}

// export streams every row of the list query (from, order, args) as a workbook, with each column
// read as text and written by its type.
func (t pgTable) export(w http.ResponseWriter, r *http.Request, total int, from, order string, args []any) {
	if total > maxExportRows {
		http.Error(w, tooManyRowsToExport, http.StatusBadRequest)
		return
	}
	names := make([]string, len(t.ordered))
	exprs := make([]string, len(t.ordered))
	kinds := make([]cellKind, len(t.ordered))
	for i, c := range t.ordered {
		names[i], kinds[i] = c.name, c.kind
		exprs[i] = "t." + pgx.Identifier{c.name}.Sanitize() + "::text"
	}
	rows, err := t.db.Query(r.Context(), fmt.Sprintf("SELECT %s FROM %s ORDER BY %s", strings.Join(exprs, ", "), from, order), args...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	x := startXLSX(w, t.name, names)
	values := make([]*string, len(names))
	for rows.Next() {
		for i, raw := range rows.RawValues() {
			values[i] = nil
			if raw != nil {
				s := string(raw)
				values[i] = &s
			}
		}
		x.row(values, kinds)
	}
	x.keep(rows.Err())
	// The status line has gone out, so a failure can only cut the download short.
	if err := x.close(); err != nil {
		log.Printf("export of %s: %v", t.name, err)
	}
}

func (t pgTable) get(w http.ResponseWriter, r *http.Request) {
	if t.db == nil {
		dataset{}.get(w, r)
		return
	}
	var s string
	err := t.db.QueryRow(r.Context(), fmt.Sprintf("SELECT row_to_json(t)::text FROM %s t WHERE %s::text = $1",
		pgx.Identifier{t.name}.Sanitize(), pgx.Identifier{t.key}.Sanitize()), chi.URLParam(r, "id")).Scan(&s)
	if err == pgx.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(s))
}

// handleMetrics computes the same figures as verventStore.metrics, in SQL.
func (s *pgVervent) handleMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	portfolio := r.URL.Query().Get("portfolio")
	var m verventMetrics
	err := s.db.QueryRow(ctx, `
		SELECT count(*),
		       count(DISTINCT camber_lease_id),
		       (SELECT count(*) FROM vervent_asset_list WHERE `+inPortfolio+`),
		       count(*) FILTER (WHERE is_account_open),
		       count(DISTINCT camber_lease_id) FILTER (WHERE is_account_open),
		       coalesce(sum(remaining_receivables) FILTER (WHERE is_account_open), 0)::float8,
		       coalesce(sum(total_past_due) FILTER (WHERE is_account_open), 0)::float8,
		       count(DISTINCT camber_lease_id) FILTER (WHERE is_account_open AND days_del > 0)
		  FROM vervent_contract_list WHERE `+inPortfolio, portfolio).
		Scan(&m.TotalContracts, &m.TotalLeases, &m.TotalAssets, &m.ActiveContracts, &m.ActiveLeases,
			&m.OutstandingReceivables, &m.PastDue, &m.DelinquentLeases)
	if err != nil {
		serverError(w, err)
		return
	}
	if m.ActiveLeases > 0 {
		m.DelinquencyRate = float64(m.DelinquentLeases) / float64(m.ActiveLeases) * 100
	}

	buckets := map[string]int{}
	err = collectCounts(ctx, s.db, buckets, `SELECT curr_delinq, count(DISTINCT camber_lease_id) FROM vervent_contract_list
		WHERE is_account_open AND days_del > 0 AND curr_delinq IS NOT NULL AND `+inPortfolio+` GROUP BY 1`, portfolio)
	if err != nil {
		serverError(w, err)
		return
	}
	for _, b := range delinquencyBuckets {
		m.DelinquencyBuckets = append(m.DelinquencyBuckets, bucketCount{Bucket: b, Leases: buckets[b]})
	}

	var asOf *string
	err = s.db.QueryRow(ctx, `
		WITH a AS (SELECT max(transaction_date_key) AS d FROM vervent_transactions)
		SELECT a.d::text,
		       coalesce(sum(t.payment_amount) FILTER (WHERE t.transaction_date_key > a.d - 30), 0)::float8,
		       coalesce(sum(t.payment_amount) FILTER (WHERE t.transaction_date_key >= date_trunc('month', a.d)::date), 0)::float8
		  FROM a LEFT JOIN (SELECT * FROM vervent_transaction_list WHERE `+inPortfolio+`) t
		    -- the last 30 days and the month to date both fall within the last 31 days
		    ON t.transaction_date_key > a.d - 31 AND t.is_non_cash IS NOT TRUE
		 GROUP BY a.d`, portfolio).Scan(&asOf, &m.Collections30d, &m.CollectionsMTD)
	if err != nil {
		serverError(w, err)
		return
	}
	if asOf != nil {
		m.AsOf = *asOf
	}

	statuses := map[string]int{}
	err = collectCounts(ctx, s.db, statuses, `SELECT status, count(*) FROM vervent_asset_list
		WHERE status IS NOT NULL AND `+inPortfolio+` GROUP BY 1`, portfolio)
	if err != nil {
		serverError(w, err)
		return
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
	writeJSON(w, m)
}

// collectCounts runs a "SELECT key, count" query into dst.
func collectCounts(ctx context.Context, db *pgxpool.Pool, dst map[string]int, sql string, args ...any) error {
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return err
	}
	var k string
	var n int
	_, err = pgx.ForEachRow(rows, []any{&k, &n}, func() error {
		dst[k] = n
		return nil
	})
	return err
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("db error: %v", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}
