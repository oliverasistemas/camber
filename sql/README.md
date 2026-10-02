# Camber Credit 2026-1 — Lease Tape SQL Entities

PostgreSQL (14+) schema and data loads generated from
`Camber Credit 2026-1 - Lease Tape August 2026 (Final - For Distribution).xlsx`
(2,228 leases, servicing cutoff 2026-08-31). Everything lives in the
`camber_credit` schema.

## Entities

| Table | Grain | Source columns |
|---|---|---|
| `vehicles` | one row per vehicle (PK `vin`) | B–E |
| `leases` | one row per contract (PK `lease_id` = tape `idx`; `vin` unique FK) | A, F–Q |
| `lease_status_types` | lookup: 0 = Active, 1 = In inventory, 2 = Sold | S (codes) |
| `lease_snapshots` | servicing status per lease per as-of date (this tape: 2026-08-31) | S–Z, AC |
| `lease_valuations` | 9% DCF par values per lease per as-of date (2025-10-31 and 2026-08-31) | R, AA, AB, AD |
| `v_lease_tape` (view) | reconstructs the original tape layout | — |

Splitting the snapshot/valuation columns out by as-of date means next month's
tape loads as new `lease_snapshots` / `lease_valuations` rows instead of new
columns.

## Running

```sh
psql -d <db> -f 01_schema.sql
psql -d <db> -f 02_reference_data.sql
psql -d <db> -f 03_load_vehicles.sql
psql -d <db> -f 04_load_leases.sql
psql -d <db> -f 05_load_lease_snapshots.sql
psql -d <db> -f 06_load_lease_valuations.sql
psql -d <db> -f 07_tieout_checks.sql   # verification — every row should show pass = t
```

The load files (03–06) are generated — regenerate with
`python3 generate_loads.py [path-to-xlsx]` (requires `openpyxl`).

## Tie-out

`07_tieout_checks.sql` verifies row counts and the seven control totals
embedded in row 1 of the tape (contract residual, both par-value dates,
net sales proceeds, August collections, residual PV, eligible-collateral PV).
PV columns are stored at 6 decimal places, so PV sums are compared with a
0.01 tolerance. Verified passing on PostgreSQL 14.19.

## Source-data notes (loaded verbatim)

- 15 VINs are not 17 characters (one 14, ten 16, four 18) — `vin` is
  `varchar(20)`, no length constraint enforced.
- Two Active (status 0) leases carry a termination type in the source file;
  the tie-out script asserts this known quirk stays at exactly 2 rows.
- `period_payment_collected` (tape column X, "camber_august_payment") can be
  negative (min −13,709.50 in this tape).
- 182 leases are status 1 ("In inventory"): terminated but vehicle unsold, so
  `sold_month` / `net_sales_proceeds` are NULL for them.
