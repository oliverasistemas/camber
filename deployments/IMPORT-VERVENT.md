# Importing a Vervent drop into the cluster

How to load the daily Vervent servicer reports into the in-cluster Postgres
(`postgres-0` in the `camber` namespace) by hand. The schema, the generator and
how the CSV columns map are documented in [`../sql/README.md`](../sql/README.md);
this file is the operational procedure.

## Where the files are

Vervent's sFTP drop is placed in the repo's inbox, one folder per drop date:

```
pipeline/data/inbox/<drop-date>/
    20261020_AssetSummary_Daily_P50.csv
    20261020_Contract Summary_P50.csv
    20261020_TransactionHistory_Daily_P50.csv
```

The filename drives the load:

- the `YYYYMMDD_` prefix is the as-of date (falls back to the folder date, with a warning);
- `AssetSummary` / `Contract Summary` / `TransactionHistory` picks the table;
- `_Daily_` / `_Monthly_` sets the cadence.

## Why this is manual

- The deployed dashboard pod has no inbox mounted and no `VERVENT_INBOX`, so
  its automatic processor (`dashboard/api/pipeline`) is disabled.
- This host has no local `psql`, so `sql/load.sh` runs its SQL inside the
  Postgres pod through a small wrapper.

## 1. Check what is already loaded

```sh
kubectl -n camber exec -i postgres-0 -- psql -U camber -d camber -X -c \
  "select file_id, report_type, cadence, asof_date, filename, row_count, loaded_at
     from vervent.report_file order by asof_date, report_type"
```

A filename already listed is replaced if loaded again.

## 2. Load

Copy the generated load scripts into the pod. Redo this after any
`generate_schema.py` run, or the pod keeps the old SQL.

```sh
kubectl -n camber exec postgres-0 -- mkdir -p /tmp/sql
for f in sql/load_*.sql; do
  kubectl -n camber cp "$f" "postgres-0:/tmp/sql/$(basename "$f")"
done
```

Create the wrapper. `load.sh` calls `$PSQL -d camber ... -f sql/load_<type>.sql`
and pipes the CSV on stdin; the wrapper points `sql/` at the pod's copy and
runs psql there.

```sh
cat > /tmp/kpsql.sh <<'EOF'
#!/bin/bash
args=(); for a in "$@"; do args+=("${a/#sql\//\/tmp\/sql\/}"); done
exec kubectl -n camber exec -i postgres-0 -- psql -U camber "${args[@]}"
EOF
chmod +x /tmp/kpsql.sh
```

Load a whole drop folder or individual files, from the repo root:

```sh
PSQL=/tmp/kpsql.sh sql/load.sh pipeline/data/inbox/2026-10-21
PSQL=/tmp/kpsql.sh sql/load.sh "pipeline/data/inbox/2026-10-21/20261020_Contract Summary_P50.csv"
```

`load.sh` checks each header against the expected one before touching the
database, then loads each file in one transaction. It stops at the first
failing file, so files after it in the list are not attempted.

## 3. Verify

```sh
kubectl -n camber exec -i postgres-0 -- psql -U camber -d camber -X -c "
  select f.report_type, f.asof_date, f.row_count,
         coalesce(a.n, c.n, t.n) as rows_in_table
    from vervent.report_file f
    left join (select file_id, count(*) n from vervent.asset_summary group by 1) a using (file_id)
    left join (select file_id, count(*) n from vervent.contract_summary group by 1) c using (file_id)
    left join (select file_id, count(*) n from vervent.transaction_history group by 1) t using (file_id)
   order by f.asof_date, f.report_type"
```

`row_count` should match `rows_in_table`, and both should match `wc -l` on
the file. The extracts have no trailing newline, so `wc -l` skips the last
line, which cancels out the header.

## When a load fails

A failure rolls back the whole file; nothing partial is written. The parsers
are strict on purpose, so a failure usually means the extract now carries a
value the schema didn't expect.

1. Read the error. `vervent.parse_*: unrecognized ... value X` names the
   value; `value too long for type character(1)` or `out of range` means a
   column's type is too narrow.
2. Find the column and every offending value in the CSV before changing
   anything, so one fix covers them all (files are pipe-delimited, UTF-8 with
   a BOM). Check all columns at once rather than fixing one error per run.
3. Fix the column spec in `sql/generate_schema.py`, never the generated SQL.
   Then regenerate and make sure the API still builds:

   ```sh
   python3 sql/generate_schema.py
   (cd dashboard/api && go build ./...)
   ```

4. Apply the change to the cluster. `01_schema.sql` uses
   `CREATE TABLE IF NOT EXISTS`, so re-running it does not change existing
   columns:
   - a parser change: run that one `CREATE OR REPLACE FUNCTION` from
     `sql/01_schema.sql`;
   - a column type change: `ALTER TABLE ... ALTER COLUMN ... TYPE ...`.
5. Copy the load scripts into the pod again (step 2) and reload the file.
6. Commit the generator and generated files, so the Go processor loads the
   same way at the next release.

### Example: the 2026-10-20 drop

The contract summary failed twice; both fixes are in PR #1.

- `COLL_DATE` had values like `02.28.2024`. The date parser gained
  `MM.DD.YYYY`. The column then turned out to be hand-entered with mixed
  formats (`YYYYMMDD`, `MMDDYY`, slashes, dots) and impossible dates, so it
  is stored as raw text.
- `CLASS` was `char(1)` but carried `EDEF` next to `V`. It is now text, as it
  already was in `asset_summary`.

The cluster changes were:

```sql
ALTER TABLE vervent.contract_summary
  ALTER COLUMN coll_date TYPE text,
  ALTER COLUMN class TYPE text;
```

Any other database created before PR #1 needs the same statement.

## Where imports are recorded

- `vervent.report_file`: one row per successfully loaded file (type,
  cadence, as-of, filename, sha256, row count, load time). Data rows point to
  it by `file_id` and are deleted with it.
- `vervent.load_event`: an append-only log of every attempt, loaded or
  failed, with the trigger (`poll`, `manual`, `cli`) and error message. Only
  the Go processor writes it. `load.sh` does not, so failed manual attempts
  leave no record.

## Open items

- The 2026-10-19 drop (`pipeline/data/inbox/2026-10-20/`) has not been loaded
  into the cluster.
- `load.sh` does not write `vervent.load_event`, although the schema allows a
  `cli` trigger.
