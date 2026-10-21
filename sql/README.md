# Vervent servicer reports — Postgres schema (`vervent`)

Typed PostgreSQL tables that mirror the three daily LeasePak extracts Vervent
delivers for the Camber portfolio (P50 = portfolio 50), plus the code lookups
from the Vervent data dictionary and a loader. This is the data foundation the
dashboard is being rebuilt on.

| CSV (example) | Table | Grain | Primary key |
|---|---|---|---|
| `20261019_AssetSummary_Daily_P50.csv` | `vervent.asset_summary` | one row per asset (vehicle or deficiency-balance asset) per report date | `(asof_date, asset_no)` |
| `20261019_Contract Summary_P50.csv` | `vervent.contract_summary` | one row per contract (lease) per report date | `(asof_date, lease_no)` |
| `20261019_TransactionHistory_Daily_P50.csv` | `vervent.transaction_history` | one row per posted transaction (daily = prior day, monthly = whole month) | `(transaction_key)` |
| — | `vervent.report_file` | one row per loaded file (type, cadence, as-of, sha256, row count) | `file_id` |
| data dictionary xlsx | `vervent.code_values` | code descriptions, keyed by `(code_set, code)` | |
| data dictionary xlsx | `vervent.gl_vector` | GL vectors for `debit_vector` / `credit_vector` | |

## Files

```
01_schema.sql                 GENERATED  schema, parsers, report_file, the 3 report tables
02_codes.sql                  GENERATED  code_values + gl_vector with seed rows
load_<report>.sql             GENERATED  per-report load: \copy -> temp text table -> typed upsert
generate_schema.py            column spec (CSV header -> column, type) -> 01_schema.sql + load_*.sql
generate_codes.py             data dictionary xlsx -> 02_codes.sql
load.sh                       loads files/folders: detects type, cadence and as-of from the filename
```

Edit the column spec in `generate_schema.py`, never the generated SQL. The
same generator also writes `dashboard/api/pipeline/reports_gen.go`, so the Go
processor (`dashboard/api/pipeline`, the production loader) and `load.sh`
(the manual psql equivalent) always load the same columns the same way.

## Running

```sh
psql -d camber -v ON_ERROR_STOP=1 -f sql/01_schema.sql      # idempotent
psql -d camber -v ON_ERROR_STOP=1 -f sql/02_codes.sql       # idempotent (ON CONFLICT DO NOTHING)
sql/load.sh pipeline/data/inbox/2026-10-20                  # or individual files
```

`load.sh` uses `CAMBER_DB` (default `camber`) and `PSQL` (default `psql`).
Each file loads in a single transaction; reloading the same filename replaces
its rows (`report_file` cascades), and rows whose key already exists from
another file (e.g. a monthly TransactionHistory overlapping the dailies) are
upserted.

To regenerate after changing the spec or receiving a new dictionary:

```sh
python3 sql/generate_schema.py
python3 sql/generate_codes.py        # requires openpyxl
```

A table whose columns changed must be dropped (or altered) before re-running
`01_schema.sql`; the DDL is `CREATE TABLE IF NOT EXISTS`.

## How the CSVs map

The files are pipe-delimited, CRLF, with literal `NULL` strings, blank
strings, and space-padded codes (`'FIN '`, `'   123026'`, `'36330    '`).

- **Column names** follow the CSV header in order: lowercase, runs of
  non-alphanumerics become `_`, CamelCase is split (`AccountKey` →
  `account_key`), concatenated caps are split on dictionary words
  (`POSTEDDATE` → `posted_date`), `#30_DEL` → `num_30_del`, `#91+_DEL` →
  `num_91_plus_del`, `1ST ASSET DESC` → `first_asset_desc`, `(Y/N)` → `_yn`.
  Every column in `01_schema.sql` carries a `-- CSV: <header>` annotation.
  Contract Summary has both `LastPaidDate` (YYYYMMDD) and `LAST PAID DATE`
  (MM/DD/YYYY); the first family keeps a `_key` suffix
  (`last_due_date_key`, `last_paid_date_key`, `next_due_date_key`).
- **Types**: dates (`MM/DD/YYYY`, `YYYYMMDD`, `YYMMDD`) → `date`; `0/1` and
  `Y/N` flags → `boolean`; 13-digit keys → `bigint`; counts/codes that are
  numeric → `integer`/`smallint`; amounts → `numeric(14,2)` or
  `numeric(14,4)` matching the delivered precision; yields, rates and ratios →
  unconstrained `numeric`; everything else → trimmed `text` (`char(1)` for
  single-letter indicators). Columns that are empty in the sample stay `text`
  unless the name says date.
- **Parsers are strict**: `vervent.parse_date / parse_num / parse_bool` raise
  on an unrecognized non-blank value, so a format change fails the load
  instead of silently producing NULLs. `load.sh` also checks the header line
  against the `-- HEADER:` recorded in the load script before touching the DB.
- **Derived column**: `lease_no_norm` on every report table strips the
  follow-on letter suffix LeasePak adds to child contracts
  (`500069007D` → `5000069007`), so deficiency-balance rows join to their
  parent lease. It is the only non-CSV column besides `file_id`, `asof_date`
  and `loaded_at`.
- **Header quirks** documented as column comments: the Asset Summary
  `EHELD_*` columns are really Asset UDF2–5 (amount, date string, model year,
  make); `UDF13` carries a list price; `LEASE` is blank on pre-inventory
  deficiency assets (the contract number is then in `serial_number`).

## Codes

`code_values.code_set` → where it is used:

| code_set | columns |
|---|---|
| `ls_status` | `contract_summary.ls_status`, `asset_summary.contr_status` |
| `asset_status` | `asset_summary.status` |
| `ls_type` | `contract_summary.ls_type`, `asset_summary.ls_type` |
| `accrual_method` | `contract_summary.accrual_method` |
| `late_code` | `contract_summary.late_code` |
| `use_tax_code` | `contract_summary.use_tax_code`, `asset_summary.tax_code` |
| `ls_source` | `contract_summary.ls_source` |
| `coll_code` | `contract_summary.coll_code` |
| `repo_code` | `asset_summary.curr_repo_status`, `asset_summary.repo_code` |
| `bank_code` | `transaction_history.bankcd` |
| `tran_code` | `transaction_history.trans` |

Join with `LEFT JOIN`; the reports carry codes the dictionary does not list
(e.g. repo status `CURR`), and there are deliberately no foreign keys from the
report tables to the lookups.

```sql
SELECT cs.lease_no, cs.ls_status, c.description
FROM vervent.contract_summary cs
LEFT JOIN vervent.code_values c ON c.code_set = 'ls_status' AND c.code = cs.ls_status;
```
