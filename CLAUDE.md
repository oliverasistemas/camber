# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Working folder for the Camber Credit engagement (auto-lease portfolio: NALN originates, Karus underwrites,
Vervent services, Copart auctions, Westlake boards). It mixes code with business artifacts:

- `dashboard/` — Go API (`api/`, pgx, Go 1.26) + React/Vite/antd SPA (`web/`). One Docker image serves both.
- `sql/` — Postgres `vervent` and `copart` schemas, generators, and the manual loader `load.sh`.
- `deployments/` — k8s manifests and scripts for the `camber` namespace on the inmatics `aws009` cluster
  (https://camber.inmatics.io). Runbooks: `IMPORT-VERVENT.md`, `NALN-SFTP.md`.
- `pipeline/data/inbox/<drop-date>/` — raw Vervent CSVs and Copart xlsx drops (data only; the old
  `pipeline/*.py` loan-tape code is gone, replaced by `sql/`).
- Non-code: `emails/` (drafts, named `YYYY-MM-DD-<who>-<topic>.txt`), `credit_policy/` (NALN matrix vs Karus
  analyses), `meetings/`, `backlog/collections/` (the pipeline task + Brad's source files), `lue/requests/`
  (raw Karus/NALN request-response JSON samples), `spreadsheets/`, and PDFs/.eml in the root.

Detailed docs live next to the code: `dashboard/README.md` (API endpoints, auth, env vars),
`sql/README.md` (column mapping rules, codes, Copart semantics), `deployments/README.md` (ship procedure).
Read those before changing the respective area; don't duplicate them here.

## Commands

```sh
# API (needs local Postgres `camber` DB; refuses to start without Google OAuth creds)
cd dashboard/api && GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… AUTH_ALLOWED_EMAILS=you@gmail.com go run .
cd dashboard/api && go test ./...                 # DB-backed tests skip when local camber DB / vervent schema is absent
cd dashboard/api && go test ./pipeline -run TestLoadInbox   # loads the sample inbox into the local DB (DATABASE_URL)
cd dashboard/api && go build ./...                # run after regenerating reports_gen.go

# Web
cd dashboard/web && npm install && npm run dev    # :5173, proxies /api to :8080
cd dashboard/web && npm run build                 # tsc -b && vite build -> web/dist, served by the API

# Database (local, Postgres 14 via Homebrew; prod is Postgres 16)
psql -d camber -v ON_ERROR_STOP=1 -f sql/01_schema.sql   # idempotent, CREATE TABLE IF NOT EXISTS
psql -d camber -v ON_ERROR_STOP=1 -f sql/02_codes.sql
psql -d camber -v ON_ERROR_STOP=1 -f sql/03_copart.sql
sql/load.sh pipeline/data/inbox/2026-10-21               # folder or individual .csv / Copart .xlsx
python3 sql/generate_schema.py                           # -> 01_schema.sql, load_*.sql, api/pipeline/reports_gen.go
python3 sql/generate_copart.py                           # -> 03_copart.sql, load_copart_*.sql
python3 sql/generate_codes.py                            # needs openpyxl

# Ship (ECR tags are immutable; always a fresh tag)
deployments/push-dashboard.sh 1.9.2
# then bump images[0].newTag in deployments/k8s/kustomization.yaml
deployments/deploy.sh
# commit the pin: "Pin dashboard image 1.9.2 (<what changed>)"

# Load a drop into the cluster DB (no local psql path to the pod; see IMPORT-VERVENT.md for the wrapper)
PSQL=/tmp/kpsql.sh sql/load.sh pipeline/data/inbox/<date>
```

## Architecture that spans directories

**Generated code, one source of truth.** The column spec in `sql/generate_schema.py` (and
`generate_copart.py`) produces three things that must stay in sync: the DDL (`01_schema.sql` /
`03_copart.sql`), the psql load scripts (`load_*.sql`), and `dashboard/api/pipeline/reports_gen.go`.
Never hand-edit the generated files; edit the spec, regenerate, `go build`, and commit all outputs together.
After a spec change the cluster also needs a manual `ALTER TABLE` / `CREATE OR REPLACE FUNCTION`
(the DDL is `IF NOT EXISTS`) and the load scripts re-copied into the `postgres-0` pod.

**Two loaders, same semantics.** `sql/load.sh` (manual, psql) and the Go processor in
`dashboard/api/pipeline` (automatic, polls `VERVENT_INBOX`) both: derive report type, cadence and as-of from
the filename (`20261019_AssetSummary_Daily_P50.csv`), check the header against the spec before touching the
DB, load one file per transaction, register it in `*.report_file`, and upsert through the strict
`vervent.parse_*` functions so any format drift fails the load rather than producing NULLs. Only the Go
processor writes `vervent.load_event`. In production the processor is disabled (no inbox mounted), so
cluster imports are manual.

**Three schema generations in one database.**
- `camber_credit` — the old pool dashboard (`/api/dashboard`, `/api/leases*`), 9% DCF PVs as of
  2026-08-31 hard-coded in `main.go`. Still served; to be rebuilt on `vervent`.
- `vervent` — the current foundation: `asset_summary`, `contract_summary`, `transaction_history` keyed by
  as-of date. Reports join on the raw lease number; `lease_no_norm` strips the `D`/`P` deficiency suffix.
- `copart` — weekly cumulative snapshot keyed on `lot_nbr` (not VIN). `copart.sale_vs_vervent` joins to
  Vervent on VIN = `asset_summary.serial_number`; Copart wins on sale proceeds and sold month when they differ
  (the loan-tape override in `backlog/collections/task.txt` step 3).

**Request flow.** The SPA uses hash routing (`#/pipeline`, `#/pipeline/contract/{leaseNo}`, `#/leases`,
`#/lease/{id}`) so the Go `http.FileServer` needs no SPA fallback. All data routes go through
`requireAuth` in `api/auth.go`: stateless HMAC cookie, Google OIDC, domain-gated to `cambercredit.com`
(`AUTH_ALLOWED_EMAILS` admits outside addresses). Query parameters are whitelisted and bound; keep that
pattern when adding endpoints. Pipeline UI lives in `web/src/pipeline/`; pool-dashboard UI in `web/src/`
with hand-rolled SVG charts in `web/src/charts/`.

## Conventions

- Commit straight to `main`; no feature branches. Commit messages are imperative one-liners describing the
  user-visible change; pins are their own commit.
- Postgres dialect only. Prod Postgres has a 512Mi memory limit: wide aggregates OOM-kill it, so profile
  against the local DB or the CSVs instead.
- `kubectl` from a new IP times out (security-group allowlist); tunnel to 6443 first.
- Email drafts and analyses are committed artifacts. Date-prefix new ones and keep them in `emails/`,
  `credit_policy/`, or `meetings/` rather than the root.
- `client_secret_*.json` and `.claude/settings.local.json` are gitignored; never commit credentials or the
  NALN sFTP password (given out of band).
