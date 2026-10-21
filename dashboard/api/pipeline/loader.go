// Package pipeline is step 1 of the Camber data pipeline: taking the Vervent
// (LeasePak) report CSVs as they are dropped and staging them, typed, into
// the vervent schema (see ../../../sql). The column spec lives in
// sql/generate_schema.py, which generates both the SQL and reports_gen.go.
package pipeline

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Report is one Vervent report type as the loader needs it (generated).
type Report struct {
	Name       string   // report_type: asset_summary | contract_summary | transaction_history
	Table      string   // target table, schema-qualified
	Header     []string // exact CSV header fields, in file order
	Columns    []string // staging/target column names, same order as Header
	PrimaryKey []string
	InsertSQL  string // typed upsert from temp table src; $1 file_id, $2 as-of date
}

// FileInfo is what the filename tells us about a dropped file.
type FileInfo struct {
	Path     string
	Filename string
	Report   *Report
	Cadence  string // "daily", "monthly" or ""
	AsOf     string // YYYY-MM-DD
}

// LoadResult describes a completed load.
type LoadResult struct {
	FileID   int
	Rows     int
	SHA256   string
	Duration time.Duration
}

var (
	ErrUnknownReport = errors.New("filename does not name a known Vervent report")
	ErrNoAsOf        = errors.New("cannot determine the as-of date from the filename or folder")

	asofPrefixRe = regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})_`)
	asofFolderRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	nonAlnumRe   = regexp.MustCompile(`[^a-z0-9]`)
)

// DetectReport picks the report type from a filename, e.g.
// "20261019_Contract Summary_P50.csv" -> contract_summary.
func DetectReport(filename string) *Report {
	n := nonAlnumRe.ReplaceAllString(strings.ToLower(filename), "")
	switch {
	case strings.Contains(n, "assetsummary"):
		return Reports["asset_summary"]
	case strings.Contains(n, "contractsummary"):
		return Reports["contract_summary"]
	case strings.Contains(n, "transactionhist"):
		return Reports["transaction_history"]
	}
	return nil
}

// Detect derives report type, cadence and as-of date from the path. The
// as-of date is the YYYYMMDD_ filename prefix, else a YYYY-MM-DD parent
// folder (how files are dropped in pipeline/data/inbox/<date>/).
func Detect(path string) (FileInfo, error) {
	fi := FileInfo{Path: path, Filename: filepath.Base(path)}
	fi.Report = DetectReport(fi.Filename)
	if fi.Report == nil {
		return fi, ErrUnknownReport
	}
	lower := strings.ToLower(fi.Filename)
	switch {
	case strings.Contains(lower, "daily"):
		fi.Cadence = "daily"
	case strings.Contains(lower, "monthly"):
		fi.Cadence = "monthly"
	}
	if m := asofPrefixRe.FindStringSubmatch(fi.Filename); m != nil {
		fi.AsOf = m[1] + "-" + m[2] + "-" + m[3]
	} else if dir := filepath.Base(filepath.Dir(path)); asofFolderRe.MatchString(dir) {
		fi.AsOf = dir
	} else {
		return fi, ErrNoAsOf
	}
	if _, err := time.Parse("2006-01-02", fi.AsOf); err != nil {
		return fi, fmt.Errorf("as-of date %q: %w", fi.AsOf, err)
	}
	return fi, nil
}

// SHA256 of file content, hex.
func SHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// parseCSV reads a pipe-delimited Vervent file, checks the header against
// the report definition, and returns the data rows as text values. The
// literal string NULL becomes nil, matching the psql loader (NULL 'NULL').
func parseCSV(rep *Report, data []byte) ([][]any, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	r := csv.NewReader(bytes.NewReader(data))
	r.Comma = '|'
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	r.ReuseRecord = false

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	if err := checkHeader(rep, header); err != nil {
		return nil, err
	}
	var rows [][]any
	for line := 2; ; line++ {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", line, err)
		}
		if len(rec) == 1 && strings.TrimSpace(rec[0]) == "" {
			continue // trailing blank line
		}
		if len(rec) != len(rep.Columns) {
			return nil, fmt.Errorf("line %d has %d fields, expected %d", line, len(rec), len(rep.Columns))
		}
		vals := make([]any, len(rec))
		for i, v := range rec {
			if v == "NULL" {
				vals[i] = nil
			} else {
				vals[i] = v
			}
		}
		rows = append(rows, vals)
	}
	return rows, nil
}

func checkHeader(rep *Report, got []string) error {
	if len(got) != len(rep.Header) {
		return fmt.Errorf("header has %d columns, expected %d for %s", len(got), len(rep.Header), rep.Name)
	}
	for i := range got {
		if strings.TrimRight(got[i], "\r") != rep.Header[i] {
			return fmt.Errorf("header column %d is %q, expected %q for %s", i+1, got[i], rep.Header[i], rep.Name)
		}
	}
	return nil
}

// LoadFile stages one file in a single transaction: a temp text table filled
// with COPY, a fresh vervent.report_file row (replacing any earlier load of
// the same filename, whose rows cascade away), then the typed upsert.
// Any parse failure (header drift, unknown date format, bad number) rolls
// everything back.
func LoadFile(ctx context.Context, db *pgxpool.Pool, fi FileInfo, data []byte) (LoadResult, error) {
	start := time.Now()
	res := LoadResult{SHA256: SHA256(data)}
	rows, err := parseCSV(fi.Report, data)
	if err != nil {
		return res, err
	}
	res.Rows = len(rows)

	tx, err := db.Begin(ctx)
	if err != nil {
		return res, err
	}
	defer tx.Rollback(ctx)

	cols := make([]string, len(fi.Report.Columns))
	for i, c := range fi.Report.Columns {
		cols[i] = pgx.Identifier{c}.Sanitize() + " text"
	}
	if _, err := tx.Exec(ctx, "CREATE TEMP TABLE src ("+strings.Join(cols, ", ")+") ON COMMIT DROP"); err != nil {
		return res, fmt.Errorf("create staging table: %w", err)
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"src"}, fi.Report.Columns, pgx.CopyFromRows(rows)); err != nil {
		return res, fmt.Errorf("copy: %w", err)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM vervent.report_file WHERE filename = $1", fi.Filename); err != nil {
		return res, err
	}
	var cadence *string
	if fi.Cadence != "" {
		cadence = &fi.Cadence
	}
	err = tx.QueryRow(ctx, `
INSERT INTO vervent.report_file (report_type, cadence, asof_date, filename, sha256, row_count)
VALUES ($1, $2, $3::date, $4, $5, $6) RETURNING file_id`,
		fi.Report.Name, cadence, fi.AsOf, fi.Filename, res.SHA256, res.Rows).Scan(&res.FileID)
	if err != nil {
		return res, fmt.Errorf("register file: %w", err)
	}
	if _, err := tx.Exec(ctx, fi.Report.InsertSQL, res.FileID, fi.AsOf); err != nil {
		return res, fmt.Errorf("stage %s: %w", fi.Report.Name, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return res, err
	}
	res.Duration = time.Since(start)
	return res, nil
}
