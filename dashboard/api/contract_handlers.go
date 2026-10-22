package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

// One Vervent contract with what hangs off it. The three reports join on the
// raw lease number: asset_summary.lease and transaction_history.contract_number
// both equal contract_summary.lease_no. lease_no_norm (suffix stripped) only
// ties a deficiency contract (…D, …P) to the lease it came from.

type contractRelated struct {
	LeaseNo   string  `json:"leaseNo"`
	LsSource  *string `json:"lsSource"`
	AssetDesc *string `json:"assetDesc"`
}

type contractDetail struct {
	LeaseNo      string              `json:"leaseNo"`
	LeaseNoNorm  *string             `json:"leaseNoNorm"`
	AsOf         string              `json:"asOf"`
	AsOfs        []string            `json:"asOfs"` // every as-of date this contract was staged
	Contract     json.RawMessage     `json:"contract"`
	Assets       []json.RawMessage   `json:"assets"`       // asset_summary rows of the same as-of
	Transactions []json.RawMessage   `json:"transactions"` // every staged transaction, newest first
	Related      []contractRelated   `json:"related"`      // same lease_no_norm, same as-of
	Columns      map[string][]string `json:"columns"`      // report → column order
}

// GET /api/pipeline/contracts/{leaseNo}?asof=YYYY-MM-DD — one contract as of
// a date (default: the latest it was staged), its assets on that date, all
// of its staged transactions, and its base/deficiency siblings. 404 when the
// contract was never staged or not on the asked date.
func (sv *server) handlePipelineContract(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	leaseNo := r.PathValue("leaseNo")
	out := contractDetail{
		LeaseNo: leaseNo, AsOfs: []string{}, Assets: []json.RawMessage{}, Transactions: []json.RawMessage{},
		Related: []contractRelated{}, Columns: map[string][]string{},
	}

	rows, err := sv.db.Query(ctx, `
SELECT to_char(asof_date, 'YYYY-MM-DD') FROM vervent.contract_summary WHERE lease_no = $1 ORDER BY 1 DESC`, leaseNo)
	if err != nil {
		httpError(w, err)
		return
	}
	out.AsOfs, err = pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		httpError(w, err)
		return
	}
	if len(out.AsOfs) == 0 {
		http.Error(w, fmt.Sprintf(`{"error":"no staged contract %q"}`, leaseNo), http.StatusNotFound)
		return
	}
	out.AsOf = out.AsOfs[0]
	if asof := r.URL.Query().Get("asof"); asof != "" {
		if _, err := time.Parse("2006-01-02", asof); err != nil {
			http.Error(w, `{"error":"asof must be YYYY-MM-DD"}`, http.StatusBadRequest)
			return
		}
		out.AsOf = asof
	}

	err = sv.db.QueryRow(ctx, `
SELECT to_jsonb(c), lease_no_norm FROM vervent.contract_summary c
WHERE lease_no = $1 AND asof_date = $2::date`, leaseNo, out.AsOf).Scan(&out.Contract, &out.LeaseNoNorm)
	if errors.Is(err, pgx.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]any{"error": fmt.Sprintf("contract %s was not staged on %s", leaseNo, out.AsOf), "asOfs": out.AsOfs})
		return
	}
	if err != nil {
		httpError(w, err)
		return
	}

	if out.Assets, err = jsonRows(ctx, sv, `
SELECT to_jsonb(a) FROM vervent.asset_summary a WHERE lease = $1 AND asof_date = $2::date ORDER BY asset_no`, leaseNo, out.AsOf); err != nil {
		httpError(w, err)
		return
	}
	if out.Transactions, err = jsonRows(ctx, sv, `
SELECT to_jsonb(t) FROM vervent.transaction_history t WHERE contract_number = $1
ORDER BY posted_date DESC NULLS LAST, effective_date_key DESC NULLS LAST, transaction_key DESC`, leaseNo); err != nil {
		httpError(w, err)
		return
	}

	if out.LeaseNoNorm != nil {
		rows, err = sv.db.Query(ctx, `
SELECT lease_no, ls_source, first_asset_desc FROM vervent.contract_summary
WHERE lease_no_norm = $1 AND asof_date = $2::date AND lease_no <> $3 ORDER BY lease_no`, *out.LeaseNoNorm, out.AsOf, leaseNo)
		if err != nil {
			httpError(w, err)
			return
		}
		if out.Related, err = pgx.CollectRows(rows, pgx.RowToStructByPos[contractRelated]); err != nil {
			httpError(w, err)
			return
		}
	}

	rows, err = sv.db.Query(ctx, `
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'vervent' AND table_name IN ('contract_summary', 'asset_summary', 'transaction_history')
ORDER BY table_name, ordinal_position`)
	if err != nil {
		httpError(w, err)
		return
	}
	for rows.Next() {
		var t, c string
		if err := rows.Scan(&t, &c); err != nil {
			rows.Close()
			httpError(w, err)
			return
		}
		out.Columns[t] = append(out.Columns[t], c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// jsonRows runs a query whose single column is a JSON value.
func jsonRows(ctx context.Context, sv *server, sql string, args ...any) ([]json.RawMessage, error) {
	rows, err := sv.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
	if out == nil {
		out = []json.RawMessage{}
	}
	return out, err
}
