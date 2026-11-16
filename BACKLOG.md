# Backlog

Known issues and follow-ups that are not blocking. Remove an item when it is done.

## Vervent loader (from the review of ed33958, 2026-11-16)

### `be/pipeline`

- **`/app/load-vervent` ships in the image but nothing runs it.** The deploy script uses `go run`
  from a laptop over a port-forward. The intended use is a CronJob reading
  `/srv/sftp/vervent/processed` (see the open items in `deploy/SFTP.md`).

## Load history

There is no record of what was loaded. Each row carries `source_file`, `file_date` and
`loaded_at`, but an upsert overwrites them. So nothing shows which files were loaded and when,
what each one did, or which runs failed. Before the CronJob (above) loads files on its own,
this also becomes the way to see what it did.

- **Tables** (DDL in `vervent/sql`, shared by Copart):
  - `load_runs`: one row per invocation, with `id`, `started_at`, `finished_at`, `status`
    (`running` / `ok` / `failed`), `error`, `loader` (`vervent` / `copart`), `host`/`user`
    or `job` name, and `args`.
  - `load_files`: one row per file attempted in a run, with `run_id`, `source_file`,
    `file_date`, `table_name`, `sha256`, `bytes`, `rows_in_file`, `inserted`, `updated`,
    `skipped` (older `file_date` or an existing transaction key), `status`, `error`,
    `started_at`, `finished_at`.
- **Writes**: create the run row before loading, in its own committed statement, so a failed
  run is still recorded. Write each file's row in the same transaction as its data, so "ok"
  means committed, and update the row's status on failure. A file refused by the
  pre-load checks is recorded as `failed` with nothing loaded. Get inserted/updated counts
  from `RETURNING (xmax = 0)` on the upsert, and get skipped as `rows_in_file` minus both.
- **Uses**:
  - Skip or warn on a file whose `sha256` was already loaded `ok`. Re-loading stays allowed,
    since it is idempotent.
  - Have `load-vervent.sh` print the last N runs.
  - Optionally add a read-only API endpoint and page, using the generic list contract and
    `openPGVervent` registration, so the dashboard shows when data was last refreshed.
- **Scope**: the Go loader first. `copart/load.py` either writes the same rows through psql,
  or waits until it is ported too.
- **Schema change on the live DB**: the tables are new, so `deploy/load-schema.sh` creates
  them (`IF NOT EXISTS`). Like every new table, the API's startup check must not require
  them unless the endpoint is added.
- **Backfill**: optionally insert synthetic `load_files` rows for what is already loaded
  (2026-11-10 to 11-13 Vervent, from `source_file`/`file_date`; Copart from its tables),
  marked as backfilled.
