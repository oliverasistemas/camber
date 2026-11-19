// Command load-vervent loads Vervent P50 daily extracts into the vervent_* tables.
//
//	DATABASE_URL=postgres://... load-vervent vervent/20261111_*_Daily_P50.csv
//	deploy/load-vervent.sh vervent/2026111*_*.csv          # into the cluster
//
// Every file's name, header and row shape are checked against the embedded DDL before anything
// is written. Files load oldest first, one transaction each, and the run stops at the first
// failure. Contracts and assets upsert so an older file never overwrites newer data;
// transactions are append-only. Every ContractSummary file, older ones included, also writes its
// day to vervent_contract_snapshots. Re-loading is safe.
//
// Each run and every file it attempts is recorded in load_runs / load_files
// (vervent/sql/04_load_history.sql). Set LOAD_INVOKED_BY to name the caller (for example a Job);
// it defaults to user@host.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"text/tabwriter"
	"time"

	"camber/pipeline/history"
	"camber/pipeline/vervent"

	"github.com/jackc/pgx/v5"
)

const recentRuns = 5

func main() {
	if len(os.Args) < 2 {
		fail("usage: load-vervent YYYYMMDD_<AssetSummary|ContractSummary|TransactionHistory>_Daily_P50.csv...")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fail("DATABASE_URL is not set")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fail("connecting to database: %v", err)
	}
	defer conn.Close(context.Background())

	paths := append([]string(nil), os.Args[1:]...)
	vervent.Sort(paths)
	run, err := history.Start(ctx, conn, "vervent", paths)
	if err != nil {
		fail("recording the run: %v", err)
	}
	// abort records the failed file (after its rollback, so on the connection), closes the run as
	// failed and exits. pgx closes the connection when a query's context is cancelled (Ctrl-C),
	// so an interrupted run is recorded on a fresh connection with a fresh context.
	abort := func(rec history.File, msg string) {
		bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		hc := conn
		if conn.IsClosed() {
			if hc, err = pgx.Connect(bg, dsn); err != nil {
				fail("%s (run %d left as running: reconnecting to record the failure: %v)", msg, run.ID, err)
			}
			defer hc.Close(bg)
		}
		if err := run.Record(bg, hc, rec); err != nil {
			fmt.Fprintf(os.Stderr, "recording the failed file: %v\n", err)
		}
		runErr := rec.Err
		if !strings.HasPrefix(runErr.Error(), rec.SourceFile) {
			runErr = fmt.Errorf("%s: %w", rec.SourceFile, runErr)
		}
		if err := run.Finish(hc, runErr); err != nil {
			fmt.Fprintf(os.Stderr, "closing run %d: %v\n", run.ID, err)
		}
		fail("%s (run %d)", msg, run.ID)
	}

	// Read and check every file before writing anything, so a bad header in a later file stops
	// the run before the earlier files are committed.
	files := make([]*vervent.File, len(paths))
	for i, p := range paths {
		started := time.Now()
		f, err := vervent.Read(p)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			abort(record(f, started, nil, err), "nothing loaded")
		}
		files[i] = f
	}

	for _, f := range files {
		started := time.Now()
		fmt.Printf("=== %s (%s, %s)\n", f.Name, f.Report.Name, f.FileDate.Format("2006-01-02"))
		if prevRun, at, ok, err := history.PreviousOK(ctx, conn, f.SHA256); err != nil {
			abort(record(f, started, nil, err), f.Name+": checking load history failed; later files not attempted")
		} else if ok {
			fmt.Printf("note: identical file already loaded in run %d at %s; loading again (safe)\n",
				prevRun, at.Local().Format("2006-01-02 15:04:05 MST"))
		}
		c, err := f.Load(ctx, conn, func(tx pgx.Tx, c history.Counts) error {
			return run.Record(ctx, tx, record(f, started, &c, nil))
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			abort(record(f, started, nil, err), f.Name+": load failed and was rolled back; later files not attempted")
		}
		fmt.Printf("%s: %d rows (%d inserted, %d updated, %d unchanged)\n",
			f.Name, c.Rows, c.Inserted, c.Updated, c.Skipped())
		if s := f.Report.Snapshot; s != nil {
			fmt.Printf("%s: %d rows for %s\n", s.Table, f.Snapshotted, f.FileDate.Format("2006-01-02"))
		}
	}
	if err := run.Finish(conn, nil); err != nil {
		fail("closing run %d: %v", run.ID, err)
	}

	summary, err := vervent.Summary(ctx, conn)
	if err != nil {
		fail("summary: %v", err)
	}
	fmt.Println()
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "table\tfile_date\tcount")
	for _, r := range summary {
		fmt.Fprintf(w, "%s\t%s\t%s\n", r[0], r[1], r[2])
	}
	w.Flush()

	recent, err := history.Recent(ctx, conn, "vervent", recentRuns)
	if err != nil {
		fail("recent runs: %v", err)
	}
	fmt.Printf("\nlast %d runs\n", len(recent))
	w = tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "run\tstarted\tstatus\tfiles\tfailed\tinserted\tupdated\tby")
	for _, r := range recent {
		fmt.Fprintf(w, "%d\t%s\t%s\t%d\t%d\t%d\t%d\t%s\n", r.ID, r.StartedAt.Local().Format("2006-01-02 15:04"),
			r.Status, r.Files, r.Failed, r.Inserted, r.Updated, r.InvokedBy)
	}
	w.Flush()
}

// record builds the history row for f; c is nil unless the file loaded.
func record(f *vervent.File, started time.Time, c *history.Counts, err error) history.File {
	rec := history.File{
		SourceFile: f.Name, FileDate: f.FileDate, SHA256: f.SHA256, Bytes: f.Bytes,
		Counts: c, Err: err, StartedAt: started,
	}
	if f.Report != nil {
		rec.Table = f.Report.Table
	}
	return rec
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
