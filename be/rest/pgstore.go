package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pgTable serves one vervent_* table with the same API as the mock dataset: rows come back as
// row_to_json, so the JSON matches what generate_mock.py writes.
type pgTable struct {
	db      *pgxpool.Pool
	name    string
	key     string
	columns map[string]bool // whitelist for sort and filter column names
}

type pgVervent struct {
	db                              *pgxpool.Pool
	contracts, assets, transactions pgTable
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
	}{
		{"vervent_contracts", "lease_no", &s.contracts},
		{"vervent_assets", "asset_no", &s.assets},
		{"vervent_transactions", "transaction_key", &s.transactions},
	} {
		cols, err := tableColumns(ctx, db, t.name)
		if err != nil {
			db.Close()
			return nil, err
		}
		*t.dst = pgTable{db: db, name: t.name, key: t.key, columns: cols}
	}
	return s, nil
}

func tableColumns(ctx context.Context, db *pgxpool.Pool, table string) (map[string]bool, error) {
	rows, err := db.Query(ctx, `SELECT column_name FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = $1`, table)
	if err != nil {
		return nil, err
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("table %s not found; run vervent/sql/0*.sql first", table)
	}
	cols := make(map[string]bool, len(names))
	for _, n := range names {
		cols[n] = true
	}
	return cols, nil
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

// list mirrors dataset.list: limit/offset paging, sort=col or sort=-col with nulls last, and any
// other parameter filters on that column by exact match of its text form ("null" matches NULL).
// Column names are checked against the table's columns and values are bound, never interpolated.
func (t pgTable) list(w http.ResponseWriter, r *http.Request) {
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
	q.Del("limit")
	q.Del("offset")
	q.Del("sort")

	var where []string
	var args []any
	for col, vals := range q {
		if !t.columns[col] {
			http.Error(w, "unknown filter column "+col, http.StatusBadRequest)
			return
		}
		if vals[0] == "null" {
			where = append(where, pgx.Identifier{col}.Sanitize()+" IS NULL")
			continue
		}
		args = append(args, vals[0])
		where = append(where, fmt.Sprintf("%s::text = $%d", pgx.Identifier{col}.Sanitize(), len(args)))
	}
	from := pgx.Identifier{t.name}.Sanitize() + " t"
	if len(where) > 0 {
		from += " WHERE " + strings.Join(where, " AND ")
	}
	order := pgx.Identifier{t.key}.Sanitize()
	if sortCol != "" {
		dir := "ASC"
		if desc {
			dir = "DESC"
		}
		order = fmt.Sprintf("%s %s NULLS LAST, %s", pgx.Identifier{sortCol}.Sanitize(), dir, order)
	}

	ctx := r.Context()
	var total int
	if err := t.db.QueryRow(ctx, "SELECT count(*) FROM "+from, args...).Scan(&total); err != nil {
		serverError(w, err)
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
	writeJSON(w, map[string]any{"total": total, "limit": limit, "offset": offset, "data": page})
}

func (t pgTable) get(w http.ResponseWriter, r *http.Request) {
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
	var m verventMetrics
	err := s.db.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM vervent_contracts),
		       (SELECT count(*) FROM vervent_assets),
		       count(*),
		       coalesce(sum(remaining_receivables), 0)::float8,
		       coalesce(sum(total_past_due), 0)::float8,
		       count(*) FILTER (WHERE days_del > 0)
		  FROM vervent_contracts WHERE is_account_open`).
		Scan(&m.TotalContracts, &m.TotalAssets, &m.ActiveContracts, &m.OutstandingReceivables, &m.PastDue,
			&m.DelinquentContracts)
	if err != nil {
		serverError(w, err)
		return
	}
	if m.ActiveContracts > 0 {
		m.DelinquencyRate = float64(m.DelinquentContracts) / float64(m.ActiveContracts) * 100
	}

	buckets := map[string]int{}
	err = collectCounts(ctx, s.db, buckets, `SELECT curr_delinq, count(*) FROM vervent_contracts
		WHERE is_account_open AND days_del > 0 AND curr_delinq IS NOT NULL GROUP BY 1`)
	if err != nil {
		serverError(w, err)
		return
	}
	for _, b := range delinquencyBuckets {
		m.DelinquencyBuckets = append(m.DelinquencyBuckets, bucketCount{Bucket: b, Contracts: buckets[b]})
	}

	var asOf *string
	err = s.db.QueryRow(ctx, `
		WITH a AS (SELECT max(transaction_date_key) AS d FROM vervent_transactions)
		SELECT a.d::text, coalesce(sum(t.payment_amount), 0)::float8
		  FROM a LEFT JOIN vervent_transactions t
		    ON t.transaction_date_key > a.d - 30 AND t.is_non_cash IS NOT TRUE
		 GROUP BY a.d`).Scan(&asOf, &m.Collections30d)
	if err != nil {
		serverError(w, err)
		return
	}
	if asOf != nil {
		m.AsOf = *asOf
	}

	statuses := map[string]int{}
	err = collectCounts(ctx, s.db, statuses, `SELECT status, count(*) FROM vervent_assets WHERE status IS NOT NULL GROUP BY 1`)
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
	writeJSON(w, m)
}

// collectCounts runs a "SELECT key, count" query into dst.
func collectCounts(ctx context.Context, db *pgxpool.Pool, dst map[string]int, sql string) error {
	rows, err := db.Query(ctx, sql)
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
