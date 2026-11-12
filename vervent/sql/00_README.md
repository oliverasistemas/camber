# Vervent P50 – PostgreSQL DDL

Tables for the daily pipe-delimited extracts in `/Users/ao/pipeline/vervent/`
(`YYYYMMDD_{AssetSummary|ContractSummary|TransactionHistory}_Daily_P50.csv`).
Column meanings are in `../20261111_DataDictionary_P50.txt`, and each column's
`COMMENT` repeats them, starting with the original CSV header in brackets.

| File | Table | Source file | Source cols | Primary key | Load mode |
|---|---|---|---|---|---|
| `01_vervent_contracts.sql` | `vervent_contracts` | ContractSummary | 225 | `lease_no` | upsert (latest wins) |
| `02_vervent_assets.sql` | `vervent_assets` | AssetSummary | 82 | `asset_no` | upsert (latest wins) |
| `03_vervent_transactions.sql` | `vervent_transactions` | TransactionHistory | 46 | `transaction_key` | append |

Run them in order. They are idempotent (`IF NOT EXISTS`) and have no schema prefix,
so set `search_path` first if the tables should live outside `public`:

```sh
for f in sql/0*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
```

Every table also has three metadata columns: `source_file`, `file_date` (from the
file-name prefix) and `loaded_at`.

## Joins (no FK constraints)
- `vervent_assets.lease` → `vervent_contracts.lease_no` (1:1; 58 assets have no lease)
- `vervent_transactions.contract_number` → `vervent_contracts.lease_no`
- `vervent_assets.lessee_no` = `vervent_contracts.lessee_no` (customer)

There are no foreign keys because orphan deficiency/inventory assets exist and files
can arrive in any order.

## Naming and type conventions
- Headers are converted to snake_case (`LEASE NO` → `lease_no`, `AccountKey` → `account_key`,
  `#30_DEL` → `del_30_count`, `1ST ASSET DESC` → `first_asset_desc`).
  `LastDueDate`/`LastPaidDate`/`NextDueDate` become `*_date_key` so they don't clash
  with `LAST PAID DATE` / `NEXT DUE`. `TRIM` is a reserved word, so it is quoted: `"trim"`.
- Mislabelled source columns keep source-based names (e.g. `eheld_lessee` actually
  holds the model year). The comments state the real content.
- **Dates** are stored as `date`. The source format is given in the column comment:
  `MM/DD/YYYY`, `YYYYMMDD` (the `*_key` columns) or `YYMMDD` (`curr_repo_status_date`, `mod_date`).
- **Money** is `numeric(18,2)`. The 12-decimal asset income columns are `numeric(24,12)`,
  and rates/yields are `numeric(20,10)`.
- **Text** is used for codes, lease/contract numbers, ZIPs, phones, VINs, and fields
  with mixed formats (`coll_date`, `eheld_*`, `on_hand`, several `contr_udf_*`).
- **Booleans**: `is_*` and `pap` (source `0/1` or `True/False`).
- Columns that are empty or always 0 in the samples are kept, because later files may populate them.

## Loading pattern
Source values are space-padded and use `''` for null, so load through an all-text
staging table, then trim and cast:

```sql
CREATE TEMP TABLE stg (c0 text, c1 text, /* … one per source column … */);
\copy stg FROM '20261111_ContractSummary_Daily_P50.csv'
      WITH (FORMAT csv, DELIMITER '|', HEADER true, QUOTE E'\x01', ENCODING 'LATIN1')

INSERT INTO vervent_contracts (account_key, /* … */, source_file, file_date)
SELECT NULLIF(btrim(c0),'')::bigint,
       /* dates:   to_date(NULLIF(btrim(cN),''),'YYYYMMDD' | 'MM/DD/YYYY' | 'YYMMDD') */
       /* bools:   CASE NULLIF(btrim(cN),'') WHEN '1' THEN true WHEN 'True' THEN true
                                            WHEN '0' THEN false WHEN 'False' THEN false END */
       /* … */
       '20261111_ContractSummary_Daily_P50.csv', DATE '2026-11-11'
FROM stg
ON CONFLICT (lease_no) DO UPDATE
   SET account_key = EXCLUDED.account_key, /* … every column … */,
       source_file = EXCLUDED.source_file, file_date = EXCLUDED.file_date, loaded_at = now()
 WHERE vervent_contracts.file_date <= EXCLUDED.file_date;   -- an older file never overwrites newer data
```

For `vervent_transactions`, use `ON CONFLICT (transaction_key) DO NOTHING`.

`QUOTE E'\x01'` turns off quote handling, because the extracts are not quoted.

Known source quirks to handle in the transform:
- `int_rate` contains the overflow placeholder `-21474.83648`.
- `remaining_payments` has outliers.
- Some ZIPs have lost their leading zero.

Rows that are no longer sent are not deleted. If you need that, compare `file_date`
with the latest load date.

`../load.py` implements this pattern for whole files, with the mapping read from these DDL
comments; see `../../deploy/README.md` for loading into the cluster.
