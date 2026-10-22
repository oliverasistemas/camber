package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"camber/dashboard/api/pipeline"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testServer wires the handlers over the local camber database with the
// sample inbox; skips when either is missing. Auth is bypassed on purpose:
// these tests cover the handlers, requireAuth has its own tests.
func testServer(t *testing.T) (*server, *http.ServeMux) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/camber"
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Skipf("no database: %v", err)
	}
	var ok bool
	if err := db.QueryRow(context.Background(),
		"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'vervent' AND table_name = 'load_event')").Scan(&ok); err != nil || !ok {
		t.Skipf("vervent schema not loaded here (%v)", err)
	}
	t.Cleanup(db.Close)
	inbox, _ := filepath.Abs(filepath.Join("..", "..", "pipeline", "data", "inbox"))
	if _, err := os.Stat(inbox); err != nil {
		t.Skipf("sample inbox missing: %v", err)
	}
	sv := &server{db: db, proc: pipeline.New(db, inbox, 0)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/pipeline", sv.handlePipeline)
	mux.HandleFunc("POST /api/pipeline/scan", sv.handlePipelineScan)
	mux.HandleFunc("GET /api/pipeline/staged/{report}", sv.handlePipelineStaged)
	return sv, mux
}

func get(t *testing.T, mux *http.ServeMux, method, url string, out any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, url, nil))
	if out != nil && rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s %s: bad JSON: %v\n%s", method, url, err, rec.Body.String())
		}
	}
	return rec.Code
}

func TestPipelineEndpoints(t *testing.T) {
	_, mux := testServer(t)

	var scan pipeline.ScanResult
	if code := get(t, mux, "POST", "/api/pipeline/scan", &scan); code != 200 {
		t.Fatalf("scan: %d", code)
	}
	if scan.Failed != 0 || scan.Loaded+scan.Unchanged < 3 {
		t.Fatalf("scan result: %+v", scan)
	}

	var ov pipelineOverview
	if code := get(t, mux, "GET", "/api/pipeline", &ov); code != 200 {
		t.Fatalf("overview: %d", code)
	}
	if ov.Processor == nil || ov.Processor.LastScan == nil || len(ov.Files) < 3 || len(ov.Reports) != 3 {
		t.Fatalf("overview: %+v", ov)
	}

	var st stagedRows
	if code := get(t, mux, "GET", "/api/pipeline/staged/contract_summary?limit=5", &st); code != 200 {
		t.Fatalf("staged: %d", code)
	}
	if st.AsOf != "2026-10-19" || st.Total != 10 || len(st.Rows) != 5 || len(st.Columns) < 225 {
		t.Fatalf("staged: asof=%s total=%d rows=%d cols=%d", st.AsOf, st.Total, len(st.Rows), len(st.Columns))
	}
	var first map[string]any
	if err := json.Unmarshal(st.Rows[0], &first); err != nil {
		t.Fatal(err)
	}
	if first["lease_no"] != "5000013023" || first["ls_status"] != "AEXT" || first["is_account_open"] != true {
		t.Fatalf("first row: lease_no=%v ls_status=%v open=%v", first["lease_no"], first["ls_status"], first["is_account_open"])
	}

	if code := get(t, mux, "GET", "/api/pipeline/staged/nope", nil); code != 404 {
		t.Fatalf("unknown report: %d", code)
	}
	if code := get(t, mux, "GET", "/api/pipeline/staged/asset_summary?asof=garbage", nil); code != 400 {
		t.Fatalf("bad asof: %d", code)
	}
	var empty stagedRows
	if code := get(t, mux, "GET", "/api/pipeline/staged/asset_summary?asof=1999-01-01", &empty); code != 200 || empty.Total != 0 || len(empty.Rows) != 0 {
		t.Fatalf("empty asof: %d %+v", code, empty)
	}
}

func TestPipelineStagedByFile(t *testing.T) {
	_, mux := testServer(t)
	if code := get(t, mux, "POST", "/api/pipeline/scan", nil); code != 200 {
		t.Fatalf("scan: %d", code)
	}
	var ov pipelineOverview
	if code := get(t, mux, "GET", "/api/pipeline", &ov); code != 200 {
		t.Fatalf("overview: %d", code)
	}
	var cs, other *reportFileRow
	for i := range ov.Files {
		f := &ov.Files[i]
		if f.ReportType == "contract_summary" && cs == nil {
			cs = f
		} else if f.ReportType != "contract_summary" && other == nil {
			other = f
		}
	}
	if cs == nil || other == nil {
		t.Fatalf("need a contract_summary file and one other file: %+v", ov.Files)
	}

	var st stagedRows
	url := fmt.Sprintf("/api/pipeline/staged/contract_summary?file=%d&limit=3&offset=1", cs.FileID)
	if code := get(t, mux, "GET", url, &st); code != 200 {
		t.Fatalf("by file: %d", code)
	}
	if st.File == nil || st.File.FileID != cs.FileID || st.AsOf != cs.AsOf || st.Offset != 1 || st.Limit != 3 {
		t.Fatalf("by file: file=%+v asof=%s offset=%d limit=%d", st.File, st.AsOf, st.Offset, st.Limit)
	}
	if cs.RowCount != nil && st.Total != *cs.RowCount {
		t.Fatalf("by file: total=%d, report_file.row_count=%d", st.Total, *cs.RowCount)
	}
	for _, raw := range st.Rows {
		var r map[string]any
		if err := json.Unmarshal(raw, &r); err != nil {
			t.Fatal(err)
		}
		if int(r["file_id"].(float64)) != cs.FileID {
			t.Fatalf("row from file %v, want %d", r["file_id"], cs.FileID)
		}
	}

	if code := get(t, mux, "GET", fmt.Sprintf("/api/pipeline/staged/contract_summary?file=%d", other.FileID), nil); code != 409 {
		t.Fatalf("wrong report: %d", code)
	}
	if code := get(t, mux, "GET", "/api/pipeline/staged/contract_summary?file=999999999", nil); code != 404 {
		t.Fatalf("unknown file: %d", code)
	}
	if code := get(t, mux, "GET", "/api/pipeline/staged/contract_summary?file=abc", nil); code != 400 {
		t.Fatalf("bad file: %d", code)
	}
}
