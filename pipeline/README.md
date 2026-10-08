# Camber Collections Pipeline

Monthly data pipeline that replaces the manual spreadsheet process behind
Brad's "Camber Collections Report": it ingests the Vervent (servicer) sFTP
reports and Copart remarketing data, applies Camber's manual overrides,
generates the monthly loan tape, and publishes it to the PostgreSQL tables the
pool dashboard reads.

```
Vervent sFTP ──► fetch ──► stage ──► vervent_raw.*   (verbatim, text)
Copart weekly ─────────────┘           camber_ops.copart_*
                                            │
camber_ops.overrides  (manual QC) ──────────┤
camber_ops.pool       (static attrs) ───────┤
                                            ▼
                               build ──► camber_credit.loan_tape
                                            │ tieout (vs workbook / expected)
                                            ▼
                             publish ──► camber_credit.lease_snapshots
                                         camber_credit.lease_valuations
                                         (read by dashboard/, see ../sql)
```

Requirements: Python 3.12+, `openpyxl`, local `psql` (PostgreSQL 14+,
database `camber` — override with `CAMBER_DB`). No other dependencies.

## Monthly run

```sh
python3 run.py fetch --asof 2026-09-30            # 1. pull Vervent files (sFTP env vars; see fetch.py)
python3 run.py stage data/inbox/2026-09-30/* --asof 2026-09-30   # 1-2. stage raw reports
python3 run.py copart-suggest --asof 2026-09-30   # 3. propose overrides from Copart settlements
#   review the proposals, save approved rows to a CSV, then:
python3 run.py load-overrides my_overrides.csv    # 3. apply manual/Copart overrides
python3 run.py build --asof 2026-09-30            # 4. generate the loan tape
python3 run.py publish --asof 2026-09-30          # 5. upsert the dashboard tables
```

`stage` accepts the files as Vervent/Copart deliver them (.XLSX or .csv) and
recognizes the report type from the filename (`--type` to force). Recognized:
Vervent AssetSummary / Contract Summary / TransactionHistory (daily or
monthly), Vervent EOT charges, the Camber Lease Term Report, CB offboarded
accounts, Copart `CamberSalesInventorySalesReport` (both tabs), and the Copart
portal "Inventory Report" lot export.

## One-time setup / replaying August 2026 from Brad's workbook

Brad's workbook embeds the raw servicer reports *and* his computed tape, so a
month can be replayed end-to-end and verified cell-by-cell:

```sh
python3 run.py init                                # create schemas
python3 extract_workbook.py                        # split the workbook into data/
python3 run.py seed-pool  data/seed/pool_2026_1.csv
python3 run.py seed-prior data/seed/prior_tape_2026-07-31.csv --asof 2026-07-31
python3 run.py stage data/inbox/2026-08-31/*.csv --asof 2026-08-31
python3 run.py load-overrides data/overrides/overrides_2026-08-31.csv
python3 run.py build --asof 2026-08-31
python3 run.py load-expected data/expected/expected_tape_2026-08-31.csv --asof 2026-08-31
python3 run.py tieout --asof 2026-08-31
python3 run.py publish --asof 2026-08-31
```

### August 2026 tie-out result

All 29 compared fields match Brad's workbook across all 2,228 leases, after
encoding the workbook's seven hand-edited cells as explicit overrides
(`extract_workbook.py` detects hardcoded cells / row-level formula edits
automatically). Two known residuals, both artifacts of stale cached
intermediates inside Brad's workbook, not calculation differences:

- `net_sales_proceeds` on leases 5000069029 / 5000826184: workbook caches `0`
  where a full recalc (and the pipeline) gives blank — both mean "no proceeds";
  the leases are status-pinned to "in inventory" by Brad's hardcoded cells.
- Lease 5000400316 period payment: Brad's working file says 35,436.54 (his
  manual cell edits); the August *distribution* tape shipped 25,188.52 (the
  un-edited formula). The pipeline follows the working file via overrides.

The published snapshot/valuation rows also tie to the independently loaded
distribution tape (../sql) on every field for all 2,228 leases except that one
lease payment.

## Overrides (step 3)

`camber_ops.overrides` holds one row per lease / month / field — the explicit
replacement for the workbook's override columns *and* its hidden hand-edited
cells. Fields: `sold_month`, `sale_proceeds`, `past_due_receivables`,
`days_delinquent`, `eol_ar_exclusion`, `under_review`, `lease_status`
(pins a status and suppresses servicer sold-date detection), and
`period_cash_flow` / `period_payment_excl_taxes` (replace computed
collections). Final tape values always prefer the override; the
servicer-reported value is kept alongside (`vervent_*` columns).

`copart-suggest` compares Copart "Sales Tab" settlements (by VIN) against the
servicer-reported proceeds on the latest tape and prints proposed override
rows in the load-overrides CSV format — review before loading; nothing is
applied automatically.

## Business rules (from the workbook's Field Dictionary + formulas)

- **Lease status** (0 active / 1 in inventory / 2 sold): servicer sold date ⇒
  sold; else LeasePak asset status code mapped via
  `camber_ops.asset_status_codes`; else carried from the prior month.
- **Sold month** is sticky: once a lease shows sold it stays sold; overrides
  take precedence over servicer data.
- **Net sale proceeds**: override (e.g. Copart settlement) → servicer asset
  `SALE PROCEEDS` → prior month.
- **Collections** (from TransactionHistory): sum of `PAYMENT AMOUNT` posted in
  the month, excluding non-cash `G/L ADJUSTMENT` rows; property/sales tax
  split by the report's component columns. Note: the workbook's SUMIFS
  silently skips text-typed `Is Non Cash` cells; the pipeline parses them, so
  it excludes non-cash G/L rows the workbook misses.
- **Receivables**: past-due from ContractSummary (zeroed unless delinquent);
  end-of-lease AR from the Lease Term Report, else Vervent EOT charges, else
  the incidence×severity assumptions (mileage 765, wear 360).
- **Par values**: PV of remaining payments (midpoint single-discount) plus PV
  of the contract residual plus receivables, at the lease's contracted rate
  and at a fixed 9%; 2025 PPT proration (0.951684788…%) added for status 0/1;
  leases 120+ days delinquent are excluded from eligible collateral.
- **Lease ID normalization**: follow-on contracts get a letter suffix
  (`500069007D` deficiency rows → parent `5000069007`) —
  `camber_ops.norm_lease_id` mirrors the workbook's `LEASE_ID_NORM`.
  Status/sold-date lookups intentionally match the *raw* lease number only;
  proceeds and collections aggregate over the normalized id.

Month-over-month dependencies (prior sold month, proceeds, cumulative
collections) come from the prior month's `loan_tape` row, so months must be
built in order. The 2025-2 pool and the UMB bank-recon tab of the workbook are
not yet covered (next step), nor is the move from Copart to Manheim reporting.
