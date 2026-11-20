// Package portfolio takes portfolio snapshots: frozen, servicer-neutral copies of the contracts
// at a point in time (portfolio_snapshots / portfolio_snapshot_contracts,
// portfolio/sql/01_portfolio_snapshots.sql).
//
// The loader takes a daily snapshot for every ContractSummary file and the API takes a manual one
// on demand; both go through Capture, so the mapping from the servicer's columns and the totals
// are defined once, here.
package portfolio

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Snapshot kinds.
const (
	Daily  = "daily"
	Manual = "manual"
)

// Mapping names the servicer column a snapshot column is copied from.
type Mapping struct {
	Column string // portfolio_snapshot_contracts column
	From   string // servicer column
}

// Source is the contracts to copy: a servicer, a relation holding its contract rows and the
// mapping of that relation's columns onto the snapshot's.
type Source struct {
	Servicer string
	// Relation is SQL that can follow FROM: a table name or a parenthesised SELECT. It is
	// interpolated, so it must not carry user input. Every one of its columns except loaded_at is
	// kept in servicer_row.
	Relation string
	Columns  []Mapping
}

// verventColumns maps vervent_contracts onto the snapshot columns. The term, cost, residual and
// payment columns are the ones the lease_terminations view reads.
var verventColumns = []Mapping{
	{"contract_no", "lease_no"},
	{"status", "ls_status"},
	{"is_open", "is_account_open"},
	{"commencement_date", "commence_date"},
	{"maturity_date", "maturity_date"},
	{"term_months", "term"},
	{"original_cost", "orig_cost"},
	{"residual", "tot_residual"},
	{"monthly_payment", "curr_pymt"},
	{"outstanding_receivables", "remaining_receivables"},
	{"past_due", "total_past_due"},
	{"days_delinquent", "days_del"},
	{"delinquency_bucket", "curr_delinq"},
}

// Vervent is a Source of Vervent contracts: relation has the columns of vervent_contracts.
func Vervent(relation string) Source {
	return Source{Servicer: "vervent", Relation: relation, Columns: verventColumns}
}

// Snapshot describes the snapshot to take. Empty strings are stored as NULL.
type Snapshot struct {
	Kind       string // Daily or Manual
	AsOf       string // YYYY-MM-DD: the date the data describes
	Name, Note string // manual snapshots
	TakenBy    string
	SourceFile string // daily snapshots
}

func (src Source) from(column string) string {
	for _, m := range src.Columns {
		if m.Column == column {
			return "c." + pgx.Identifier{m.From}.Sanitize()
		}
	}
	panic("portfolio: " + src.Servicer + " has no mapping for " + column)
}

// Capture copies every row of src into a new snapshot and returns its id and the number of
// contracts copied. The totals on the header are then computed from the rows just copied, so they
// always equal the sums over the snapshot's contract rows.
//
// A servicer has one daily snapshot per as-of date: taking it again replaces its totals and its
// contract rows and keeps its id.
func Capture(ctx context.Context, tx pgx.Tx, src Source, s Snapshot) (id, contracts int64, err error) {
	err = tx.QueryRow(ctx, `
INSERT INTO portfolio_snapshots (kind, as_of, name, note, taken_by, servicer, source_file,
       total_contracts, active_contracts, outstanding_receivables, past_due, delinquent_contracts)
VALUES ($1, $2::date, NULLIF($3, ''), NULLIF($4, ''), $5, $6, NULLIF($7, ''), 0, 0, 0, 0, 0)
ON CONFLICT (servicer, as_of) WHERE kind = 'daily' DO UPDATE SET
       taken_at = now(), taken_by = EXCLUDED.taken_by, source_file = EXCLUDED.source_file
RETURNING id`,
		s.Kind, s.AsOf, s.Name, s.Note, s.TakenBy, src.Servicer, s.SourceFile).Scan(&id)
	if err != nil {
		return 0, 0, fmt.Errorf("portfolio_snapshots: %w", err)
	}
	// Only a daily snapshot taken again has rows already.
	if _, err = tx.Exec(ctx, `DELETE FROM portfolio_snapshot_contracts WHERE snapshot_id = $1`, id); err != nil {
		return 0, 0, fmt.Errorf("portfolio_snapshot_contracts: %w", err)
	}
	targets := make([]string, len(src.Columns))
	exprs := make([]string, len(src.Columns))
	for i, m := range src.Columns {
		targets[i] = pgx.Identifier{m.Column}.Sanitize()
		exprs[i] = src.from(m.Column)
	}
	tag, err := tx.Exec(ctx, fmt.Sprintf(`
INSERT INTO portfolio_snapshot_contracts (snapshot_id, as_of, kind, %s, servicer_row)
SELECT $1::bigint, $2::date, $3::text, %s, to_jsonb(c) - 'loaded_at'
  FROM %s c`, strings.Join(targets, ", "), strings.Join(exprs, ", "), src.Relation),
		id, s.AsOf, s.Kind)
	if err != nil {
		return 0, 0, fmt.Errorf("portfolio_snapshot_contracts: %w", err)
	}
	// The same formulas as the header comment of 01_portfolio_snapshots.sql.
	_, err = tx.Exec(ctx, `
UPDATE portfolio_snapshots s
   SET total_contracts = t.total, active_contracts = t.active, outstanding_receivables = t.receivables,
       past_due = t.past_due, delinquent_contracts = t.delinquent
  FROM (SELECT count(*) AS total,
               count(*) FILTER (WHERE is_open) AS active,
               coalesce(sum(outstanding_receivables) FILTER (WHERE is_open), 0) AS receivables,
               coalesce(sum(past_due) FILTER (WHERE is_open), 0) AS past_due,
               count(*) FILTER (WHERE is_open AND days_delinquent > 0) AS delinquent
          FROM portfolio_snapshot_contracts WHERE snapshot_id = $1) t
 WHERE s.id = $1`, id)
	if err != nil {
		return 0, 0, fmt.Errorf("portfolio_snapshots: %w", err)
	}
	return id, tag.RowsAffected(), nil
}
