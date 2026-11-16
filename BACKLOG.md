# Backlog

Known issues and follow-ups that are not blocking. Remove an item when it is done.

## Vervent loader (from the review of ed33958, 2026-11-16)

### `be/pipeline`

- **`/app/load-vervent` ships in the image but nothing runs it.** The deploy script uses `go run`
  from a laptop over a port-forward. The intended use is a CronJob reading
  `/srv/sftp/vervent/processed` (see the open items in `deploy/SFTP.md`).
- **Memory grows with the number of files in a run** (from the review of 7573d20).
  `cmd/load-vervent/main.go` now reads every file before loading any, and each `File` keeps its
  parsed rows until the run ends. A day of drops is roughly 12,000 rows of 225 columns, an
  estimated 80-100 MB in memory (not measured). `deploy/load-vervent.sh` with no arguments loads
  every `vervent/*_Daily_P50.csv`, so the run grows with each day of accumulated files. Fix:
  validate name, header and row shape in a first pass without keeping rows, then re-read each
  file as it loads (or free a file's rows once it is committed and load one day at a time).

### `deploy/load-vervent.sh`

- **A dead port-forward still waits the full 10 seconds.** If `kubectl port-forward` exits at
  once (tunnel down, wrong context), the readiness loop keeps polling before the script reports
  the failure. Fix: break out of the loop when `kill -0 $pf` fails.

## Load history

Done for the Vervent loader (`load_runs` / `load_files`, `vervent/sql/04_load_history.sql`,
`be/pipeline/history`). Left:

- **Copart loads are not recorded.** `copart/load.py` should write the same rows through psql
  (`loader = 'copart'`), or wait until it is ported to Go and reuse `be/pipeline/history`.
- **No API endpoint or page.** A read-only list of `load_runs` / `load_files` (generic list
  contract, one entry in `openPGVervent`, made optional in the startup check) would let the
  dashboard show when data was last refreshed.
- **No backfill.** Loads before the history tables existed (Vervent 2026-11-10 to 11-13, the
  Copart workbook) have no rows. Optionally insert one synthetic run per loader, marked as
  backfilled in `invoked_by`, with `load_files` rows derived from `source_file`/`file_date`
  (no hash or counts).
- **A killed process leaves its run `running`.** `kill -9`, a lost laptop connection or an OOM
  kill skip the cleanup. Readers should treat an old `running` row as dead; a CronJob could
  mark runs older than an hour as `failed`.
