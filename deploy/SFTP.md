# SFTP drop box: status and process

One SFTP server on aws009 receives files from Camber's counterparties. Each
counterparty has its own chrooted user. This file covers who sends what, what
has arrived, and how a file gets from the drop box into the cambercredit
database. Loading itself is described in [`README.md`](README.md#loading-a-vervent-drop).

## Status (checked 2026-11-12)

| User | uid | Sends | Since | Files received | Auth | Ingested |
|---|---|---|---|---|---|---|
| `vervent` | 1001 | Daily servicer reports (AssetSummary, ContractSummary, TransactionHistory CSVs) | 2026-10-06 | 16 files on 5 processing days, last 2026-11-11 | password only | Manually; the 2026-11-10 and 2026-11-11 files are loaded |
| `westlake` | 1002 | Not defined yet (boarding) | account exists | none | password only | n/a |
| `naln` | 1003 | One combined PDF per funded loan (they can't split it per Funding Checklist document) | 2026-10-30 | 2 test files (2026-11-04 empty `.txt`, 2026-11-05 `NALN TESTING.pdf`), no real loans yet | password only | Nothing reads them yet |

Copart's weekly Sales & Inventory xlsx does **not** come through SFTP.

Server and processor are healthy: the `sftp` pod has run 12 days without a
restart, the `sftp-processor` CronJob runs every 15 minutes and its last runs
completed. No user has an SSH key installed (all three `authorized_keys.*`
are empty).

### What Vervent has sent

Folders are the day the processor moved the files, not the as-of date.

| Processed folder | Files |
|---|---|
| `2026-10-06` | `context.txt` (connection test) |
| `2026-10-19` | `YYYYMMDD_*` header-only samples |
| `2026-10-20` | as-of 2026-10-19 (small test set) |
| `2026-10-21` | as-of 2026-10-20 (first full drop, old `Contract Summary_P50` naming) |
| `2026-11-11` | as-of 2026-11-10 and 2026-11-11 (current `*_Daily_P50` naming) |

Nothing arrived between 2026-10-21 and 2026-11-10. Only the `*_Daily_P50.csv`
files from 2026-11-10 on are in the `vervent/` format that `vervent/load.py`
reads; the October files predate it.

## How it works

```
counterparty --sftp:2222--> aws009 node /srv/sftp/<user>/upload/
                                   |
                    sftp-processor CronJob (*/15, busybox)
                                   v
                     /srv/sftp/<user>/processed/<YYYY-MM-DD>/
                                   |
                       pulled by hand (step 2)
                                   v
                 vervent/  --deploy/load-vervent.sh-->  postgres-0 (vervent_* tables)
```

- **Server:** `atmoz/sftp:alpine`, namespace `sftp`, hostPort 2222 on the QA
  node (`ip-172-31-20-191`), same node as the camber pods.
- **Processor:** every 15 minutes it moves any file in `upload/` older than 60s
  to `processed/<today UTC>/`. It only moves files; its "process" step is a
  placeholder that logs the name and size. If a move fails, the file stays in
  `upload/` and the job fails.
- **Manifests** live in the inmatics repo (`~/inmatics`), not here:
  `deployments/k8s/sftp/{sftp,processor}.yaml` and
  `deployments/create-sftp-secrets.sh` (users, passwords, host keys).

## Connection details (for counterparties)

| | |
|---|---|
| Host | `aws009.inmatics.io` (18.207.57.97) |
| Port | `2222` (22 is the node's own sshd) |
| User | `vervent`, `westlake` or `naln` |
| Password | given out of band; never stored in this repo |
| Host key (ED25519) | `SHA256:7XpoHYA00JUC1hoLcL5mE4auYwKJofICzVBYh8KaYPE` |
| Upload to | `upload/` |

```sh
sftp -P 2222 naln@aws009.inmatics.io
sftp> cd upload
sftp> put <file>
```

To test a password login non-interactively, `sftp -b` needs `-o BatchMode=no`,
otherwise it fails with `Permission denied`.

## Process: from drop box to database

### 1. See what arrived

```sh
kubectl -n sftp exec deploy/sftp -- sh -c 'ls /home/*/upload; ls /home/*/processed'
kubectl -n sftp exec deploy/sftp -- ls -l /home/vervent/processed/2026-11-11
kubectl -n sftp get jobs                              # last runs and failures
```

To run the processor now instead of waiting up to 15 minutes:

```sh
kubectl -n sftp create job --from=cronjob/sftp-processor sftp-processor-manual
```

### 2. Pull the files into `vervent/`

```sh
d=2026-11-11
kubectl -n sftp exec deploy/sftp -- tar -C "/home/vervent/processed/$d" -cf - . \
  | tar -C vervent -xf - --wildcards '*_Daily_P50.csv'
```

The `--wildcards` filter skips test files such as `context.txt`. The raw files
are CRLF; `load.py` normalizes that, so load them as pulled. Use
`/home/naln/processed/$d` the same way for NALN, into a folder of its own.

### 3. Load

```sh
deploy/load-vervent.sh vervent/20261111_*_Daily_P50.csv
```

It checks every header before sending anything, loads each file in one
transaction, and prints row counts per table and `file_date` at the end.
Re-loading is safe. On a header or cast failure, see
[`README.md`](README.md#loading-a-vervent-drop).

NALN: there is no loader. Nothing else to do yet.

## Accounts

- Rotate a password or add a key with
  `~/inmatics/deployments/create-sftp-secrets.sh <user> [key.pub]`. It prints the
  new password once, keeps the other users and the host keys, and restarts the
  pod (a few seconds of downtime for everyone).
- A new user needs a uid in `create-sftp-secrets.sh` and an `authorized_keys`
  mount in `sftp.yaml`.
- atmoz/sftp prints `users.conf`, passwords included, to the pod log at every
  start. Anyone with `kubectl logs` on `sftp` can read them. Key auth avoids
  relying on that.

## Open items

- Ingest is manual end to end. Both pods are on the same node, so the app (or
  a CronJob running `load.py`) could read `/srv/sftp/vervent/processed`
  directly.
- Vervent's daily cadence is not regular yet: no files between 2026-10-21 and
  2026-11-10.
- Westlake has an account but has never connected, and nobody has said what
  they will send.
- NALN has only sent tests. A real funded-loan PDF still needs a destination
  (where it is stored, how it is matched to a lease).
- Move every user to key auth so passwords stop mattering.
