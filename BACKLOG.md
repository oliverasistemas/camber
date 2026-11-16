# Backlog

Known issues and follow-ups that are not blocking. Remove an item when it is done.

## Vervent loader (from the review of ed33958, 2026-11-16)

### `be/pipeline`

- **`/app/load-vervent` ships in the image but nothing runs it.** The deploy script uses `go run`
  from a laptop over a port-forward. The intended use is a CronJob reading
  `/srv/sftp/vervent/processed` (see the open items in `deploy/SFTP.md`).
