// Package history records loader runs and the files they attempt in load_runs and load_files
// (DDL: vervent/sql/04_load_history.sql).
package history

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/user"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Execer is satisfied by *pgx.Conn and pgx.Tx, so a file row can be written inside the file's
// own transaction.
type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Run is one loader invocation.
type Run struct {
	ID int64
}

// File is one attempted file. Zero values (and nil pointers) are stored as NULL.
type File struct {
	SourceFile string
	FileDate   time.Time
	Table      string
	SHA256     string
	Bytes      int64
	Counts     *Counts // nil when nothing was loaded
	Err        error   // nil: ok
	StartedAt  time.Time
}

// Counts are a loaded file's row counts.
type Counts struct {
	Rows, Inserted, Updated int64
}

// Skipped is the rows that changed nothing: an older file_date or a key already present.
func (c Counts) Skipped() int64 { return c.Rows - c.Inserted - c.Updated }

// Start commits a 'running' run row, so the run is on record even if it fails.
func Start(ctx context.Context, conn *pgx.Conn, loader string, args []string) (*Run, error) {
	r := &Run{}
	err := conn.QueryRow(ctx,
		`INSERT INTO load_runs (loader, invoked_by, args) VALUES ($1, $2, $3) RETURNING id`,
		loader, invokedBy(), args).Scan(&r.ID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" { // undefined_table
			return nil, fmt.Errorf("%w (create the load history tables: deploy/load-schema.sh, or psql -f vervent/sql/04_load_history.sql)", err)
		}
		return nil, err
	}
	return r, nil
}

// Record writes the file's row through q: the file's transaction for an ok file, the connection
// after the rollback for a failed one.
func (r *Run) Record(ctx context.Context, q Execer, f File) error {
	status, errText := "ok", (*string)(nil)
	if f.Err != nil {
		status = "failed"
		s := f.Err.Error()
		errText = &s
	}
	var rows, ins, upd, skip *int64
	if c := f.Counts; c != nil {
		s := c.Skipped()
		rows, ins, upd, skip = &c.Rows, &c.Inserted, &c.Updated, &s
	}
	_, err := q.Exec(ctx, `INSERT INTO load_files (run_id, source_file, file_date, table_name, sha256,
		bytes, rows_in_file, inserted, updated, skipped, status, error, started_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		r.ID, f.SourceFile, nullTime(f.FileDate), nullString(f.Table), nullString(f.SHA256),
		nullInt(f.Bytes, f.SHA256 != ""), rows, ins, upd, skip, status, errText, f.StartedAt)
	return err
}

// Finish marks the run ok (runErr nil) or failed. It uses its own context so an interrupted run
// is still closed.
func (r *Run) Finish(conn *pgx.Conn, runErr error) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	status, errText := "ok", (*string)(nil)
	if runErr != nil {
		status = "failed"
		s := runErr.Error()
		errText = &s
	}
	_, err := conn.Exec(ctx, `UPDATE load_runs SET status = $2, error = $3, finished_at = now() WHERE id = $1`,
		r.ID, status, errText)
	return err
}

// PreviousOK returns the latest earlier ok load of a file with this hash, if any.
func PreviousOK(ctx context.Context, conn *pgx.Conn, sha256 string) (runID int64, at time.Time, found bool, err error) {
	err = conn.QueryRow(ctx, `SELECT run_id, finished_at FROM load_files
		WHERE sha256 = $1 AND status = 'ok' ORDER BY finished_at DESC LIMIT 1`, sha256).Scan(&runID, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, time.Time{}, false, nil
	}
	return runID, at, err == nil, err
}

// RunSummary is one row of Recent.
type RunSummary struct {
	ID        int64
	StartedAt time.Time
	Status    string
	InvokedBy string
	Files     int64
	Failed    int64
	Inserted  int64
	Updated   int64
}

// Recent returns the last n runs of a loader, newest first.
func Recent(ctx context.Context, conn *pgx.Conn, loader string, n int) ([]RunSummary, error) {
	rows, err := conn.Query(ctx, `
		SELECT r.id, r.started_at, r.status, coalesce(r.invoked_by, ''),
		       count(f.id), count(f.id) FILTER (WHERE f.status = 'failed'),
		       coalesce(sum(f.inserted), 0)::bigint, coalesce(sum(f.updated), 0)::bigint
		FROM load_runs r LEFT JOIN load_files f ON f.run_id = r.id
		WHERE r.loader = $1
		GROUP BY r.id ORDER BY r.id DESC LIMIT $2`, loader, n)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[RunSummary])
}

func invokedBy() string {
	if v := os.Getenv("LOAD_INVOKED_BY"); v != "" {
		return v
	}
	name := os.Getenv("USER")
	if u, err := user.Current(); err == nil && u.Username != "" {
		name = u.Username
	}
	host, _ := os.Hostname()
	if name == "" {
		return host
	}
	return name + "@" + host
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nullTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func nullInt(v int64, valid bool) *int64 {
	if !valid {
		return nil
	}
	return &v
}
