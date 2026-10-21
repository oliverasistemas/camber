package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"camber/dashboard/api/pipeline"

	"github.com/jackc/pgx/v5"
)

// Pipeline step 1 (Vervent intake) endpoints. Everything here reads the
// vervent schema; the processor itself lives in ./pipeline.

type reportFileRow struct {
	FileID     int     `json:"fileId"`
	ReportType string  `json:"reportType"`
	Cadence    *string `json:"cadence"`
	AsOf       string  `json:"asOf"`
	Filename   string  `json:"filename"`
	SHA256     *string `json:"sha256"`
	RowCount   *int    `json:"rowCount"`
	LoadedAt   string  `json:"loadedAt"`
}

type loadEventRow struct {
	EventID    int64   `json:"eventId"`
	At         string  `json:"at"`
	Trigger    string  `json:"trigger"`
	Filename   string  `json:"filename"`
	ReportType *string `json:"reportType"`
	AsOf       *string `json:"asOf"`
	Status     string  `json:"status"`
	RowCount   *int    `json:"rowCount"`
	Message    *string `json:"message"`
}

type pipelineOverview struct {
	Processor *pipeline.Status `json:"processor"` // nil when no inbox is configured
	Reports   []string         `json:"reports"`
	Files     []reportFileRow  `json:"files"`
	Events    []loadEventRow   `json:"events"`
}

type stagedRows struct {
	Report  string            `json:"report"`
	AsOf    string            `json:"asOf"`
	AsOfs   []string          `json:"asOfs"` // every as-of date staged for this report
	Columns []string          `json:"columns"`
	Total   int               `json:"total"`
	Offset  int               `json:"offset"`
	Limit   int               `json:"limit"`
	Rows    []json.RawMessage `json:"rows"`
}

// GET /api/pipeline — processor state, loaded files, recent load events.
func (sv *server) handlePipeline(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	out := pipelineOverview{Files: []reportFileRow{}, Events: []loadEventRow{}}
	if sv.proc != nil {
		st := sv.proc.Status()
		out.Processor = &st
	}
	for _, name := range reportNames() {
		out.Reports = append(out.Reports, name)
	}

	rows, err := sv.db.Query(ctx, `
SELECT file_id, report_type, cadence, to_char(asof_date, 'YYYY-MM-DD'), filename, sha256, row_count,
       to_char(loaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM vervent.report_file ORDER BY asof_date DESC, report_type`)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var x reportFileRow
		if err := rows.Scan(&x.FileID, &x.ReportType, &x.Cadence, &x.AsOf, &x.Filename, &x.SHA256, &x.RowCount, &x.LoadedAt); err != nil {
			rows.Close()
			httpError(w, err)
			return
		}
		if x.SHA256 != nil {
			s := strings.TrimSpace(*x.SHA256)
			x.SHA256 = &s
		}
		out.Files = append(out.Files, x)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		httpError(w, err)
		return
	}

	rows, err = sv.db.Query(ctx, `
SELECT event_id, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), trigger, filename,
       report_type, to_char(asof_date, 'YYYY-MM-DD'), status, row_count, message
FROM vervent.load_event ORDER BY event_id DESC LIMIT 50`)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var x loadEventRow
		if err := rows.Scan(&x.EventID, &x.At, &x.Trigger, &x.Filename, &x.ReportType, &x.AsOf, &x.Status, &x.RowCount, &x.Message); err != nil {
			rows.Close()
			httpError(w, err)
			return
		}
		out.Events = append(out.Events, x)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// POST /api/pipeline/scan — run the inbox scan now and return its result.
func (sv *server) handlePipelineScan(w http.ResponseWriter, r *http.Request) {
	if sv.proc == nil {
		http.Error(w, `{"error":"no inbox configured (VERVENT_INBOX)"}`, http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	res, err := sv.proc.Scan(ctx, "manual")
	if errors.Is(err, pipeline.ErrBusy) {
		http.Error(w, `{"error":"a scan is already running"}`, http.StatusConflict)
		return
	}
	if err != nil {
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// GET /api/pipeline/staged/{report}?asof=YYYY-MM-DD&limit=25&offset=0 — the
// staged rows of one report for one as-of date (default: the latest), each
// row as a JSON object keyed by column name, plus the column order.
func (sv *server) handlePipelineStaged(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	rep, ok := pipeline.Reports[r.PathValue("report")]
	if !ok {
		http.Error(w, `{"error":"unknown report"}`, http.StatusNotFound)
		return
	}
	q := r.URL.Query()
	out := stagedRows{Report: rep.Name, AsOfs: []string{}, Columns: []string{}, Rows: []json.RawMessage{}, Limit: 25}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v >= 1 && v <= 500 {
		out.Limit = v
	}
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		out.Offset = v
	}

	// rep.Table / rep.PrimaryKey are generated constants, never user input.
	rows, err := sv.db.Query(ctx, `SELECT DISTINCT to_char(asof_date, 'YYYY-MM-DD') FROM `+rep.Table+` ORDER BY 1 DESC`)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			rows.Close()
			httpError(w, err)
			return
		}
		out.AsOfs = append(out.AsOfs, d)
	}
	rows.Close()
	if asof := q.Get("asof"); asof != "" {
		if _, err := time.Parse("2006-01-02", asof); err != nil {
			http.Error(w, `{"error":"asof must be YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
		out.AsOf = asof
	} else if len(out.AsOfs) > 0 {
		out.AsOf = out.AsOfs[0]
	}

	rows, err = sv.db.Query(ctx, `
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'vervent' AND table_name = $1 ORDER BY ordinal_position`, rep.Name)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			rows.Close()
			httpError(w, err)
			return
		}
		out.Columns = append(out.Columns, c)
	}
	rows.Close()

	if out.AsOf == "" { // nothing staged yet
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
		return
	}
	if err := sv.db.QueryRow(ctx, `SELECT count(*) FROM `+rep.Table+` WHERE asof_date = $1::date`, out.AsOf).Scan(&out.Total); err != nil {
		httpError(w, err)
		return
	}
	order := make([]string, len(rep.PrimaryKey))
	for i, c := range rep.PrimaryKey {
		order[i] = pgx.Identifier{c}.Sanitize()
	}
	rows, err = sv.db.Query(ctx, fmt.Sprintf(
		`SELECT to_jsonb(t) FROM %s t WHERE asof_date = $1::date ORDER BY %s LIMIT $2 OFFSET $3`,
		rep.Table, strings.Join(order, ", ")), out.AsOf, out.Limit, out.Offset)
	if err != nil {
		httpError(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var raw json.RawMessage
		if err := rows.Scan(&raw); err != nil {
			httpError(w, err)
			return
		}
		out.Rows = append(out.Rows, raw)
	}
	if err := rows.Err(); err != nil {
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// reportNames in a stable order.
func reportNames() []string {
	return []string{"asset_summary", "contract_summary", "transaction_history"}
}
