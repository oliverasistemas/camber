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

// Pipeline step 1 (Vervent intake) endpoints, plus the Copart weekly report
// that sql/load.sh stages into the copart schema. The processor itself lives
// in ./pipeline and only knows the Vervent CSVs; Copart files are read here
// for display.

type reportFileRow struct {
	Source     string  `json:"source"`     // vervent | copart
	FileID     int     `json:"fileId"`     // unique within its source's registry only
	ReportType string  `json:"reportType"` // asset_summary ... | copart_inventory | copart_sales
	Cadence    *string `json:"cadence"`
	AsOf       string  `json:"asOf"`
	Filename   string  `json:"filename"`
	SourceFile *string `json:"sourceFile"` // Copart: the xlsx the tab was split from
	SHA256     *string `json:"sha256"`
	RowCount   *int    `json:"rowCount"`
	LoadedAt   string  `json:"loadedAt"`
}

// stagedReport is one staged table the pipeline pages can browse: the
// generated Vervent reports plus the two tabs of the Copart report.
type stagedReport struct {
	Name       string   // report_type as the API and the routes name it
	Source     string   // vervent | copart
	Schema     string   // schema of the staged table
	Table      string   // staged table, unqualified
	PrimaryKey []string // row order in the browser
	// One row of the source's registry as a reportFileRow, by file_id ($1).
	fileSQL string
}

const verventFileSQL = `
SELECT 'vervent', file_id, report_type, cadence, to_char(asof_date, 'YYYY-MM-DD'), filename, NULL::text, sha256, row_count,
       to_char(loaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM vervent.report_file`

const copartFileSQL = `
SELECT 'copart', file_id, 'copart_' || report_type, NULL::text, to_char(asof_date, 'YYYY-MM-DD'), filename, source_file, sha256, row_count,
       to_char(loaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM copart.report_file`

// stagedReports in a stable order: Vervent first, then Copart.
func stagedReports() []stagedReport {
	out := []stagedReport{}
	for _, name := range []string{"asset_summary", "contract_summary", "transaction_history"} {
		rep := pipeline.Reports[name]
		out = append(out, stagedReport{Name: name, Source: "vervent", Schema: "vervent", Table: name, PrimaryKey: rep.PrimaryKey, fileSQL: verventFileSQL})
	}
	for _, tab := range []string{"inventory", "sales"} {
		out = append(out, stagedReport{Name: "copart_" + tab, Source: "copart", Schema: "copart", Table: tab, PrimaryKey: []string{"asof_date", "lot_nbr"}, fileSQL: copartFileSQL})
	}
	return out
}

func stagedReportByName(name string) (stagedReport, bool) {
	for _, r := range stagedReports() {
		if r.Name == name {
			return r, true
		}
	}
	return stagedReport{}, false
}

func scanReportFile(row pgx.Row, x *reportFileRow) error {
	if err := row.Scan(&x.Source, &x.FileID, &x.ReportType, &x.Cadence, &x.AsOf, &x.Filename, &x.SourceFile, &x.SHA256, &x.RowCount, &x.LoadedAt); err != nil {
		return err
	}
	if x.SHA256 != nil {
		s := strings.TrimSpace(*x.SHA256)
		x.SHA256 = &s
	}
	return nil
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
	File    *reportFileRow    `json:"file,omitempty"` // set when the request named one file
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

	rows, err := sv.db.Query(ctx, `SELECT * FROM (`+verventFileSQL+` UNION ALL `+copartFileSQL+`) f ORDER BY 5 DESC, 3`)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var x reportFileRow
		if err := scanReportFile(rows, &x); err != nil {
			rows.Close()
			httpError(w, err)
			return
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
// With file=<id> instead, the rows of that one loaded file, plus the file's
// metadata; 404 when the file does not exist, 409 when it is another report.
func (sv *server) handlePipelineStaged(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	rep, ok := stagedReportByName(r.PathValue("report"))
	if !ok {
		http.Error(w, `{"error":"unknown report"}`, http.StatusNotFound)
		return
	}
	table := pgx.Identifier{rep.Schema, rep.Table}.Sanitize()
	q := r.URL.Query()
	out := stagedRows{Report: rep.Name, AsOfs: []string{}, Columns: []string{}, Rows: []json.RawMessage{}, Limit: 25}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v >= 1 && v <= 500 {
		out.Limit = v
	}
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		out.Offset = v
	}

	// table / rep.PrimaryKey come from stagedReports(), never from user input.
	rows, err := sv.db.Query(ctx, `SELECT DISTINCT to_char(asof_date, 'YYYY-MM-DD') FROM `+table+` ORDER BY 1 DESC`)
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
	if fs := q.Get("file"); fs != "" {
		id, err := strconv.Atoi(fs)
		if err != nil || id < 1 {
			http.Error(w, `{"error":"file must be a positive integer"}`, http.StatusBadRequest)
			return
		}
		var f reportFileRow
		err = scanReportFile(sv.db.QueryRow(ctx, rep.fileSQL+` WHERE file_id = $1`, id), &f)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, fmt.Sprintf(`{"error":"no loaded file with id %d"}`, id), http.StatusNotFound)
			return
		}
		if err != nil {
			httpError(w, err)
			return
		}
		if f.ReportType != rep.Name {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]any{"error": fmt.Sprintf("file %d is a %s file", id, f.ReportType), "file": f})
			return
		}
		out.File = &f
		out.AsOf = f.AsOf
	} else if asof := q.Get("asof"); asof != "" {
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
WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, rep.Schema, rep.Table)
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
	// Rows are filtered by file when one was named, otherwise by as-of date.
	where, arg := `asof_date = $1::date`, any(out.AsOf)
	if out.File != nil {
		where, arg = `file_id = $1`, out.File.FileID
	}
	if err := sv.db.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE `+where, arg).Scan(&out.Total); err != nil {
		httpError(w, err)
		return
	}
	order := make([]string, len(rep.PrimaryKey))
	for i, c := range rep.PrimaryKey {
		order[i] = pgx.Identifier{c}.Sanitize()
	}
	rows, err = sv.db.Query(ctx, fmt.Sprintf(
		`SELECT to_jsonb(t) FROM %s t WHERE %s ORDER BY %s LIMIT $2 OFFSET $3`,
		table, where, strings.Join(order, ", ")), arg, out.Limit, out.Offset)
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

// reportNames in a stable order: the Vervent reports, then the Copart tabs.
func reportNames() []string {
	out := []string{}
	for _, r := range stagedReports() {
		out = append(out, r.Name)
	}
	return out
}
