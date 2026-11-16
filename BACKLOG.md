# Backlog

Known issues and follow-ups that are not blocking. Remove an item when it is done.

## Vervent loader (from the review of ed33958, 2026-11-16)

### `deploy/load-vervent.sh`

- **Port-forward wait falls through silently.** The readiness loop (lines 28-34) ends after ~10s
  whether or not the port came up, so a failed port-forward surfaces as a less obvious connect
  error from the loader. If something else is already listening on the local port (default 15432),
  the `/dev/tcp` probe succeeds and the loader sends the prod credentials to that listener.
  Fix: after the loop, fail unless the probe succeeded and `kill -0 $pf` shows the port-forward is
  still alive.
- **URL rewrite can no-op silently.** The substitution on line 26 assumes the secret holds
  `...@postgres:5432/...` (what `deploy/create-secrets.sh` writes). If the secret ever changes
  form (for example `postgres.camber.svc`), nothing is replaced and the loader tries to reach
  `postgres:5432` from the laptop. Fix: check that `$url` contains `127.0.0.1:$PORT` after the
  rewrite and exit with a clear message otherwise.

### `be/pipeline`

- **Validate every file before loading any.** `cmd/load-vervent/main.go` reads and loads one file
  at a time, so a bad header in a later file is found only after the earlier files are committed.
  That is safe (re-loading is idempotent) but `Read` and `Load` are already separate, so reading
  all files first is a small loop split. Trade-off: all files are held in memory at once.
- **`quoteIdent` hard-codes `trim` and `off`** (`vervent/ddl.go`). A future column named after a
  reserved word would need a loader edit, contrary to the "edit only the DDL" rule. Fix: quote
  every identifier.
- **`/app/load-vervent` ships in the image but nothing runs it.** The deploy script uses `go run`
  from a laptop over a port-forward. The intended use is a CronJob reading
  `/srv/sftp/vervent/processed` (see the open items in `deploy/SFTP.md`).

### Housekeeping

- The `Dockerfile` header comment has one over-long line; rewrap it.
