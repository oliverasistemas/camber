// Command load-vervent loads Vervent P50 daily extracts into the vervent_* tables.
//
//	DATABASE_URL=postgres://... load-vervent vervent/20261111_*_Daily_P50.csv
//	deploy/load-vervent.sh vervent/2026111*_*.csv          # into the cluster
//
// Each file's header is checked against the embedded DDL before anything is written. Files load
// oldest first, one transaction each, and the run stops at the first failure. Contracts and assets
// upsert so an older file never overwrites newer data; transactions are append-only. Re-loading
// is safe.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"text/tabwriter"

	"camber/pipeline/vervent"

	"github.com/jackc/pgx/v5"
)

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
	for _, p := range paths {
		f, err := vervent.Read(p)
		if err != nil {
			fail("%v", err)
		}
		fmt.Printf("=== %s (%s, %s)\n", f.Name, f.Report.Name, f.FileDate.Format("2006-01-02"))
		n, err := f.Load(ctx, conn)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			fail("%s: load failed and was rolled back; later files not attempted", f.Name)
		}
		fmt.Printf("%s: %d rows\n", f.Name, n)
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
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
