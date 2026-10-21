package pipeline

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Processor watches an inbox folder (where the Vervent sFTP drop lands) and
// stages every new or changed report file. It is idempotent: a file whose
// name and sha256 are already in vervent.report_file is left alone, and a
// file that failed is not retried until its content changes.
type Processor struct {
	db       *pgxpool.Pool
	Inbox    string
	Interval time.Duration

	mu      sync.Mutex
	running bool
	last    *ScanResult
	failed  map[string]failure // path -> last failed version
}

type failure struct {
	sha     string
	message string
}

// FileStatus is the outcome for one file seen during a scan.
type FileStatus struct {
	Path       string `json:"path"`
	Filename   string `json:"filename"`
	ReportType string `json:"reportType"`
	Cadence    string `json:"cadence"`
	AsOf       string `json:"asOf"`
	SHA256     string `json:"sha256"`
	Status     string `json:"status"` // loaded | unchanged | failed | skipped
	Rows       int    `json:"rows"`
	Message    string `json:"message,omitempty"`
}

// ScanResult summarizes one pass over the inbox.
type ScanResult struct {
	Trigger    string       `json:"trigger"`
	StartedAt  time.Time    `json:"startedAt"`
	FinishedAt time.Time    `json:"finishedAt"`
	Loaded     int          `json:"loaded"`
	Unchanged  int          `json:"unchanged"`
	Failed     int          `json:"failed"`
	Skipped    int          `json:"skipped"`
	Files      []FileStatus `json:"files"`
}

// Status is the processor's current state for the API.
type Status struct {
	Inbox    string      `json:"inbox"`
	Interval string      `json:"interval"`
	Running  bool        `json:"running"`
	LastScan *ScanResult `json:"lastScan"`
}

var ErrBusy = errors.New("a scan is already running")

// New returns a processor for the inbox folder; interval <= 0 disables polling.
func New(db *pgxpool.Pool, inbox string, interval time.Duration) *Processor {
	return &Processor{db: db, Inbox: inbox, Interval: interval, failed: map[string]failure{}}
}

// Status reports the processor's state.
func (p *Processor) Status() Status {
	p.mu.Lock()
	defer p.mu.Unlock()
	return Status{Inbox: p.Inbox, Interval: p.Interval.String(), Running: p.running, LastScan: p.last}
}

// Run polls the inbox every Interval until ctx is cancelled. The first scan
// happens immediately.
func (p *Processor) Run(ctx context.Context) {
	if p.Interval <= 0 {
		return
	}
	t := time.NewTicker(p.Interval)
	defer t.Stop()
	for {
		if _, err := p.Scan(ctx, "poll"); err != nil && !errors.Is(err, ErrBusy) {
			log.Printf("pipeline: scan: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Scan walks the inbox once and loads what is new. trigger is recorded in
// vervent.load_event ("poll", "manual", "cli").
func (p *Processor) Scan(ctx context.Context, trigger string) (*ScanResult, error) {
	p.mu.Lock()
	if p.running {
		p.mu.Unlock()
		return nil, ErrBusy
	}
	p.running = true
	p.mu.Unlock()

	res := &ScanResult{Trigger: trigger, StartedAt: time.Now(), Files: []FileStatus{}}
	defer func() {
		res.FinishedAt = time.Now()
		p.mu.Lock()
		p.running = false
		p.last = res
		p.mu.Unlock()
	}()

	paths, err := listCSVs(p.Inbox)
	if err != nil {
		return res, err
	}
	for _, path := range paths {
		st := p.processOne(ctx, trigger, path)
		res.Files = append(res.Files, st)
		switch st.Status {
		case "loaded":
			res.Loaded++
		case "unchanged":
			res.Unchanged++
		case "failed":
			res.Failed++
		default:
			res.Skipped++
		}
		if st.Status == "loaded" || st.Status == "failed" {
			log.Printf("pipeline: %s %s (%s) %s", st.Status, st.Filename, st.ReportType, st.Message)
		}
	}
	return res, nil
}

func (p *Processor) processOne(ctx context.Context, trigger, path string) FileStatus {
	st := FileStatus{Path: path, Filename: filepath.Base(path)}
	fi, err := Detect(path)
	if err != nil {
		st.Status = "skipped"
		st.Message = err.Error()
		return st
	}
	st.ReportType, st.Cadence, st.AsOf = fi.Report.Name, fi.Cadence, fi.AsOf

	data, err := os.ReadFile(path)
	if err != nil {
		st.Status = "failed"
		st.Message = err.Error()
		return st
	}
	st.SHA256 = SHA256(data)

	var loadedSHA *string
	var loadedRows *int
	err = p.db.QueryRow(ctx, "SELECT sha256, row_count FROM vervent.report_file WHERE filename = $1", st.Filename).Scan(&loadedSHA, &loadedRows)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		st.Status = "failed"
		st.Message = err.Error()
		return st
	}
	if loadedSHA != nil && strings.TrimSpace(*loadedSHA) == st.SHA256 {
		st.Status = "unchanged"
		if loadedRows != nil {
			st.Rows = *loadedRows
		}
		return st
	}
	p.mu.Lock()
	prev, seen := p.failed[path]
	p.mu.Unlock()
	if seen && prev.sha == st.SHA256 {
		st.Status = "failed"
		st.Message = prev.message + " (not retried until the file changes)"
		return st
	}

	lr, err := LoadFile(ctx, p.db, fi, data)
	if err != nil {
		st.Status = "failed"
		st.Message = err.Error()
		p.mu.Lock()
		p.failed[path] = failure{sha: st.SHA256, message: err.Error()}
		p.mu.Unlock()
		p.logEvent(ctx, trigger, st, nil)
		return st
	}
	p.mu.Lock()
	delete(p.failed, path)
	p.mu.Unlock()
	st.Status = "loaded"
	st.Rows = lr.Rows
	st.Message = fmt.Sprintf("%d rows in %s", lr.Rows, lr.Duration.Round(time.Millisecond))
	p.logEvent(ctx, trigger, st, &lr.Rows)
	return st
}

func (p *Processor) logEvent(ctx context.Context, trigger string, st FileStatus, rows *int) {
	var asof *string
	if st.AsOf != "" {
		asof = &st.AsOf
	}
	var reportType *string
	if st.ReportType != "" {
		reportType = &st.ReportType
	}
	_, err := p.db.Exec(ctx, `
INSERT INTO vervent.load_event (trigger, filename, sha256, report_type, asof_date, status, row_count, message)
VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)`,
		trigger, st.Filename, st.SHA256, reportType, asof, st.Status, rows, st.Message)
	if err != nil {
		log.Printf("pipeline: record load_event: %v", err)
	}
}

// listCSVs returns every *.csv under root (any depth), sorted.
func listCSVs(root string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.EqualFold(filepath.Ext(path), ".csv") {
			out = append(out, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("inbox %s: %w", root, err)
	}
	sort.Strings(out)
	return out, nil
}
