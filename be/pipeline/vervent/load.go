package vervent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"camber/pipeline/history"
	"camber/pipeline/portfolio"

	"github.com/jackc/pgx/v5"
)

var fileRE = regexp.MustCompile(`^(\d{8})_(AssetSummary|ContractSummary|TransactionHistory)_Daily_P50\.csv$`)

// File is an extract that has been read and checked against the DDL; nothing has been written yet.
// Read returns a partly filled File with its error, so a refused file can still be recorded.
type File struct {
	Path     string
	Name     string    // base name, stored in source_file
	Report   *Report   // nil if the name did not parse
	FileDate time.Time // zero if the name did not parse
	SHA256   string    // hex, of the raw bytes; empty if the file could not be read
	Bytes    int64
	// Snapshotted is the number of contracts Load copied into the day's portfolio snapshot.
	Snapshotted int64
	header      []string
	rows        [][]any
}

// Sort orders paths oldest first and, within a day, contracts before assets before transactions.
func Sort(paths []string) {
	rank := func(p string) int {
		name := filepath.Base(p)
		for i, r := range Reports {
			if strings.Contains(name, r.Name) {
				return i
			}
		}
		return 9
	}
	sort.SliceStable(paths, func(i, j int) bool {
		di, dj := datePrefix(paths[i]), datePrefix(paths[j])
		if di != dj {
			return di < dj
		}
		return rank(paths[i]) < rank(paths[j])
	})
}

func datePrefix(p string) string {
	name := filepath.Base(p)
	if len(name) > 8 {
		return name[:8]
	}
	return name
}

// Read parses the file name, reads the file and checks its header and row shape against the DDL.
// The returned File is never nil: on error it carries whatever was known (name, date, hash).
func Read(path string) (*File, error) {
	name := filepath.Base(path)
	m := fileRE.FindStringSubmatch(name)
	if m == nil {
		return &File{Path: path, Name: name}, fmt.Errorf("%s: expected YYYYMMDD_<AssetSummary|ContractSummary|TransactionHistory>_Daily_P50.csv", name)
	}
	fileDate, err := time.Parse("20060102", m[1])
	if err != nil {
		return &File{Path: path, Name: name}, fmt.Errorf("%s: bad date prefix: %v", name, err)
	}
	f := &File{Path: path, Name: name, FileDate: fileDate}
	for _, r := range Reports {
		if r.Name == m[2] {
			f.Report = r
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return f, err
	}
	sum := sha256.Sum256(data)
	f.SHA256, f.Bytes = hex.EncodeToString(sum[:]), int64(len(data))
	// The extracts are CRLF without a final newline; accept LF and a final newline too.
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	data = bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n"))
	data = bytes.TrimSuffix(data, []byte("\n"))
	lines := strings.Split(latin1(data), "\n")

	f.header = strings.Split(lines[0], "|")
	for i, h := range f.header {
		f.header[i] = strings.TrimSpace(h)
	}
	if err := f.checkHeader(); err != nil {
		return f, err
	}

	// No quoting: a '"' is a literal character, as with the old COPY ... QUOTE E'\x01'.
	n := len(f.header)
	f.rows = make([][]any, 0, len(lines)-1)
	for i, line := range lines[1:] {
		lineNo := i + 2
		if strings.ContainsRune(line, '\r') {
			return f, fmt.Errorf("%s line %d: unquoted carriage return found in data", name, lineNo)
		}
		fields := strings.Split(line, "|")
		if len(fields) > n {
			return f, fmt.Errorf("%s line %d: extra data after last expected column", name, lineNo)
		}
		if len(fields) < n {
			return f, fmt.Errorf("%s line %d: missing data for column %q", name, lineNo, f.header[len(fields)])
		}
		row := make([]any, n)
		for j, v := range fields {
			if v != "" { // an empty field is NULL, as in CSV COPY
				row[j] = v
			}
		}
		f.rows = append(f.rows, row)
	}
	return f, nil
}

// latin1 decodes ISO-8859-1 bytes to a UTF-8 string: each byte is the code point.
func latin1(b []byte) string {
	var sb strings.Builder
	sb.Grow(len(b) + len(b)/8)
	for _, c := range b {
		sb.WriteRune(rune(c))
	}
	return sb.String()
}

func (f *File) checkHeader() error {
	byHeader := map[string]bool{}
	for _, c := range f.Report.Columns {
		byHeader[c.Header] = true
	}
	inFile := map[string]int{}
	for _, h := range f.header {
		inFile[h]++
	}
	unknown, missing, dup := []string{}, []string{}, []string{}
	for _, h := range f.header {
		if !byHeader[h] {
			unknown = append(unknown, h)
		}
		if inFile[h] > 1 { // report each duplicated name once
			dup = append(dup, h)
			inFile[h] = -1
		}
	}
	for _, c := range f.Report.Columns {
		if inFile[c.Header] == 0 {
			missing = append(missing, c.Header)
		}
	}
	if len(unknown) > 0 || len(missing) > 0 || len(dup) > 0 {
		return fmt.Errorf("%s: header does not match %s\n  unknown columns: %q\n  missing columns: %q\n  duplicate columns: %q",
			f.Name, f.Report.DDLFile, unknown, missing, dup)
	}
	return nil
}

// insertSQL casts the all-text staging columns c0..cN into the table and returns one row of
// (inserted, updated) counts. $1 is source_file, $2 file_date. Rows the file_date guard or
// DO NOTHING skips are not RETURNed; xmax = 0 marks a freshly inserted row (undocumented but
// long-standing Postgres behaviour, used here only for bookkeeping counts).
func (f *File) insertSQL() string {
	r := f.Report
	cols := map[string]Column{}
	for _, c := range r.Columns {
		cols[c.Header] = c
	}
	targets := make([]string, len(f.header))
	exprs := make([]string, len(f.header))
	for i, h := range f.header {
		c := cols[h]
		targets[i] = quoteIdent(c.Name)
		exprs[i] = castExpr(fmt.Sprintf("c%d", i), c)
	}
	var sb strings.Builder
	sb.WriteString("WITH ins AS (\n")
	fmt.Fprintf(&sb, "INSERT INTO %s (%s, source_file, file_date)\nSELECT %s, $1::text, $2::date\nFROM stg\n",
		r.Table, strings.Join(targets, ", "), strings.Join(exprs, ", "))
	if r.Upsert {
		var sets []string
		for i, h := range f.header {
			if cols[h].Name != r.Key {
				sets = append(sets, targets[i]+" = EXCLUDED."+targets[i])
			}
		}
		fmt.Fprintf(&sb, "ON CONFLICT (%s) DO UPDATE SET %s, source_file = EXCLUDED.source_file, "+
			"file_date = EXCLUDED.file_date, loaded_at = now()\nWHERE %s.file_date <= EXCLUDED.file_date",
			quoteIdent(r.Key), strings.Join(sets, ", "), r.Table)
	} else {
		fmt.Fprintf(&sb, "ON CONFLICT (%s) DO NOTHING", quoteIdent(r.Key))
	}
	sb.WriteString("\nRETURNING (xmax = 0) AS inserted\n)\n" +
		"SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted) FROM ins")
	return sb.String()
}

// snapshotSource is the staged rows as a portfolio snapshot source: every column cast as
// insertSQL casts it and named as in the report's table, plus source_file, file_date and the
// computed camber_lease_id, last as in the table. It reads the staging table, not the main table,
// so a file older than the data already loaded still records its day.
func (f *File) snapshotSource() portfolio.Source {
	cols := map[string]Column{}
	for _, c := range f.Report.Columns {
		cols[c.Header] = c
	}
	exprs := make([]string, len(f.header))
	var leaseID string
	for i, h := range f.header {
		c := cols[h]
		exprs[i] = castExpr(fmt.Sprintf("c%d", i), c) + " AS " + quoteIdent(c.Name)
		if c.Name == f.Report.Key {
			leaseID = "vervent_camber_lease_id(" + castExpr(fmt.Sprintf("c%d", i), c) + ")"
		}
	}
	return portfolio.Vervent(fmt.Sprintf("(SELECT %s, %s::text AS source_file, %s::date AS file_date, %s AS %s FROM stg)",
		strings.Join(exprs, ", "), quoteLiteral(f.Name), quoteLiteral(f.FileDate.Format("2006-01-02")), leaseID, computedLeaseID))
}

func quoteLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// Load writes the file in one transaction: an all-text staging table filled with COPY, then a
// cast-and-insert from it, so a bad value fails the whole file with the Postgres cast error.
// A report with Snapshot set is also taken as the file date's daily portfolio snapshot (f.Snapshotted).
// beforeCommit (if not nil) runs inside the transaction with the file's counts, so a history row
// written there commits or rolls back with the data.
func (f *File) Load(ctx context.Context, conn *pgx.Conn, beforeCommit func(pgx.Tx, history.Counts) error) (history.Counts, error) {
	var c history.Counts
	tx, err := conn.Begin(ctx)
	if err != nil {
		return c, err
	}
	defer tx.Rollback(ctx)

	stgCols := make([]string, len(f.header))
	defs := make([]string, len(f.header))
	for i := range f.header {
		stgCols[i] = fmt.Sprintf("c%d", i)
		defs[i] = stgCols[i] + " text"
	}
	if _, err := tx.Exec(ctx, "CREATE TEMP TABLE stg ("+strings.Join(defs, ", ")+") ON COMMIT DROP"); err != nil {
		return c, err
	}
	if c.Rows, err = tx.CopyFrom(ctx, pgx.Identifier{"stg"}, stgCols, pgx.CopyFromRows(f.rows)); err != nil {
		return c, err
	}
	err = tx.QueryRow(ctx, f.insertSQL(), f.Name, f.FileDate.Format("2006-01-02")).Scan(&c.Inserted, &c.Updated)
	if err != nil {
		return c, err
	}
	if f.Report.Snapshot {
		_, f.Snapshotted, err = portfolio.Capture(ctx, tx, f.snapshotSource(), portfolio.Snapshot{
			Kind: portfolio.Daily, AsOf: f.FileDate.Format("2006-01-02"), TakenBy: "loader", SourceFile: f.Name})
		if err != nil {
			return c, err
		}
	}
	if beforeCommit != nil {
		if err := beforeCommit(tx, c); err != nil {
			return c, err
		}
	}
	return c, tx.Commit(ctx)
}

// Summary returns row counts by table and file_date, as (table, file_date, count) rows.
func Summary(ctx context.Context, conn *pgx.Conn) ([][3]string, error) {
	rows, err := conn.Query(ctx, `
		select 'vervent_contracts' as tbl, file_date::text, count(*)::text from vervent_contracts group by 2
		union all select 'vervent_assets', file_date::text, count(*)::text from vervent_assets group by 2
		union all select 'vervent_transactions', file_date::text, count(*)::text from vervent_transactions group by 2
		union all select 'portfolio_snapshots (daily)', as_of::text, total_contracts::text from portfolio_snapshots where kind = 'daily'
		order by 1, 2`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) ([3]string, error) {
		var out [3]string
		err := r.Scan(&out[0], &out[1], &out[2])
		return out, err
	})
}
