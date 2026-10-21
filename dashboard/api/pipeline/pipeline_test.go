package pipeline

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDetect(t *testing.T) {
	cases := []struct {
		path    string
		report  string
		cadence string
		asof    string
		err     error
	}{
		{"inbox/2026-10-20/20261019_AssetSummary_Daily_P50.csv", "asset_summary", "daily", "2026-10-19", nil},
		{"inbox/2026-10-20/20261019_Contract Summary_P50.csv", "contract_summary", "", "2026-10-19", nil},
		{"inbox/2026-10-20/20261019_TransactionHistory_Daily_P50.csv", "transaction_history", "daily", "2026-10-19", nil},
		{"inbox/2026-10-31/TransactionHistory_Monthly_P50.csv", "transaction_history", "monthly", "2026-10-31", nil},
		{"inbox/misc/AssetSummary_P50.csv", "asset_summary", "", "", ErrNoAsOf},
		{"inbox/2026-10-20/CamberSalesInventorySalesReport.csv", "", "", "", ErrUnknownReport},
	}
	for _, c := range cases {
		fi, err := Detect(c.path)
		if err != c.err {
			t.Errorf("%s: err %v, want %v", c.path, err, c.err)
			continue
		}
		if err != nil {
			continue
		}
		if fi.Report.Name != c.report || fi.Cadence != c.cadence || fi.AsOf != c.asof {
			t.Errorf("%s: got %s/%s/%s, want %s/%s/%s", c.path, fi.Report.Name, fi.Cadence, fi.AsOf, c.report, c.cadence, c.asof)
		}
	}
}

func TestParseCSVRejectsHeaderDrift(t *testing.T) {
	rep := Reports["transaction_history"]
	hdr := strings.Join(rep.Header[:len(rep.Header)-1], "|")
	_, err := parseCSV(rep, []byte(hdr+"\r\n1|2\r\n"))
	if err == nil || !strings.Contains(err.Error(), "expected 46") {
		t.Fatalf("want header error, got %v", err)
	}
	full := strings.Join(rep.Header, "|")
	_, err = parseCSV(rep, []byte(full+"\r\n1|2\r\n"))
	if err == nil || !strings.Contains(err.Error(), "line 2 has 2 fields") {
		t.Fatalf("want field-count error, got %v", err)
	}
}

// testDB connects to the local camber database (DATABASE_URL or the psql
// defaults) and skips the test when it is not reachable or lacks the schema.
func testDB(t *testing.T) *pgxpool.Pool {
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
	return db
}

func inboxDir(t *testing.T) string {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "pipeline", "data", "inbox", "2026-10-20")
	if _, err := os.Stat(dir); err != nil {
		t.Skipf("sample inbox missing: %v", err)
	}
	return dir
}

// TestLoadInbox stages the sample drop end to end through the processor and
// checks idempotency: a second scan loads nothing.
func TestLoadInbox(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	p := New(db, inboxDir(t), 0)

	res, err := p.Scan(ctx, "cli")
	if err != nil {
		t.Fatal(err)
	}
	if res.Failed != 0 || res.Skipped != 0 || res.Loaded+res.Unchanged != 3 {
		t.Fatalf("first scan: %+v", res)
	}
	for _, f := range res.Files {
		if f.Rows != 10 {
			t.Errorf("%s: %d rows, want 10 (%s)", f.Filename, f.Rows, f.Message)
		}
	}
	res, err = p.Scan(ctx, "cli")
	if err != nil {
		t.Fatal(err)
	}
	if res.Loaded != 0 || res.Unchanged != 3 {
		t.Fatalf("second scan not idempotent: %+v", res)
	}

	var n int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM vervent.contract_summary WHERE asof_date = '2026-10-19'").Scan(&n); err != nil || n != 10 {
		t.Fatalf("contract_summary rows = %d (%v)", n, err)
	}
	var norm string
	if err := db.QueryRow(ctx, "SELECT lease_no_norm FROM vervent.asset_summary WHERE asof_date = '2026-10-19' AND lease = '500069007D'").Scan(&norm); err != nil || norm != "5000069007" {
		t.Fatalf("lease_no_norm = %q (%v)", norm, err)
	}
	st := p.Status()
	if st.LastScan == nil || st.Running || time.Since(st.LastScan.FinishedAt) > time.Minute {
		t.Fatalf("status: %+v", st)
	}
}

// TestLoadFileRollsBack feeds a file with an unparseable date: the
// transaction must roll back and leave no registry row.
func TestLoadFileRollsBack(t *testing.T) {
	db := testDB(t)
	defer db.Close()
	ctx := context.Background()
	src := filepath.Join(inboxDir(t), "20261019_AssetSummary_Daily_P50.csv")
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	bad := strings.Replace(string(data), "|07/15/2022|", "|July 15 2022|", 1)
	if bad == string(data) {
		t.Fatal("fixture changed; expected a 07/15/2022 date")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "20261019_AssetSummary_Daily_P50_bad.csv")
	if err := os.WriteFile(path, []byte(bad), 0o644); err != nil {
		t.Fatal(err)
	}
	fi, err := Detect(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := LoadFile(ctx, db, fi, []byte(bad)); err == nil || !strings.Contains(err.Error(), "unrecognized date") {
		t.Fatalf("want parse_date error, got %v", err)
	}
	var n int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM vervent.report_file WHERE filename = $1", fi.Filename).Scan(&n); err != nil || n != 0 {
		t.Fatalf("registry row left behind: %d (%v)", n, err)
	}
}
