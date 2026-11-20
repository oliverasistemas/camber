# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Camber Credit portfolio dashboard, live at https://camber.inmatics.io. It shows lease-servicing data from Vervent (contracts, assets, transactions for portfolio "P50") next to Copart auction data (inventory, sales), and reconciles the two. One Go binary serves both the JSON API and the built React SPA; Postgres holds the data, loaded from vendor files by a Go loader (Vervent) and a Python script (Copart).

## Commands

There are no tests and no linter configured. `./lint.sh` runs the verification checks: `go vet ./...` and `go build ./...` in `be` (the Go module root), then `npm run build` in `fe/web/app`. `.githooks/pre-commit` runs it on every commit once a clone sets `git config core.hooksPath .githooks`.

### Local development

Run the API and Vite side by side; Vite proxies `/api` to `:8080` so cookies stay same-origin.

```sh
# API — must run from be/rest: the default paths for the OAuth client JSON and mock data are relative to it
cd be/rest && SESSION_SECRET=dev go run .

# SPA — http://localhost:5173
cd fe/web/app && npm install && npm run dev
```

- `SESSION_SECRET` is the only required env var. The Google OAuth client JSON (`client_secret_*.json` at the repo root, gitignored) must exist or the API exits at startup.
- Without `DATABASE_URL` the API serves `vervent/mock/*.json` and all Copart endpoints return empty lists. Set `DATABASE_URL` to use Postgres; the API then exits at startup unless the `vervent_*_list` views, the `copart_*` tables and the `copart_vs_vervent` view exist (`load_runs`/`load_files`, the `portfolio_snapshots` tables, `portfolios` and the `lease_terminations` view are optional: without them their pages are empty).
- Other env: `ADDR`, `FRONTEND_URL`, `GOOGLE_REDIRECT_URL`, `GOOGLE_CLIENT_SECRET_FILE`, `VERVENT_MOCK_DIR`, `STATIC_DIR`, `AUTH_ALLOWED_DOMAIN`, `AUTH_ALLOWED_EMAILS` (see `be/rest/main.go`), and `LOAD_FILES_DIR` (see `be/rest/loadfiles.go`).

### Local Postgres

```sh
# in this order: the Vervent and Copart views read the portfolio tables
for f in portfolio/sql/0*.sql vervent/sql/0*.sql copart/sql/0*.sql; do psql -d cambercredit -v ON_ERROR_STOP=1 -f "$f"; done
python3 portfolio/load.py "portfolio/Camber Credit - Lease IDs & Portfolios.xlsx"   # needs openpyxl; before the Vervent files, whose snapshot needs it
(cd be && DATABASE_URL=postgres:///cambercredit go run ./pipeline/cmd/load-vervent "$PWD"/../vervent/20261111_*_Daily_P50.csv)
python3 copart/load.py copart/CamberSalesInventorySalesReport_2026-10-05.xlsx   # needs openpyxl
```

The Vervent loader connects with `DATABASE_URL`; `deploy/load-vervent.sh` port-forwards the cluster's Postgres and runs it. `copart/load.py` and `portfolio/load.py` pipe to the command in `$PSQL` (default `psql -d cambercredit`), which `deploy/load-copart.sh` and `deploy/load-portfolios.sh` set to `kubectl exec -i postgres-0 -- psql ...`.

Regenerate mock data (fully synthetic, derived from the DDL): `python3 vervent/mock/generate_mock.py`.

### Shipping

```sh
deploy/push.sh <new-tag>      # build the image and push to ECR; tags are immutable, always use a fresh one
# bump newTag in deploy/k8s/kustomization.yaml
deploy/deploy.sh              # kubectl apply -k + wait for rollout
```

Commit history follows this as two commits: the change, then "Ship app image X.Y.Z (…)". If a build depends on new tables/views, run `deploy/load-schema.sh` first or the new pod crash-loops. `deploy/load-portfolios.sh` loads Camber's lease list; until it has run, every figure is zero and the Vervent loader refuses to take a snapshot. `deploy/README.md` covers cluster access (kubectl needs an SSH tunnel from non-allowlisted IPs), secrets, sign-in allowlist, and loading vendor drops; `deploy/SFTP.md` covers the Vervent SFTP drop box.

## Architecture

### The DDL is the source of truth

`vervent/sql/0*.sql` and `copart/sql/0*.sql` drive everything downstream (`portfolio/sql` holds the snapshot tables and Camber's portfolios, which no vendor file loads into):

- `vervent/sql` is a symlink to `be/pipeline/vervent/sql`, which lives inside the Go module so the loader can `embed` it (a DDL change needs a rebuild of the loader).
- Each `COMMENT ON COLUMN` starts with the source file's header in `[brackets]`; date columns end with `Source format <fmt>`. The loaders (`be/pipeline/vervent/ddl.go`, `copart/load.py`) parse the DDL with regexes to build the column mapping, and refuse a file whose headers don't match. **Adding or renaming a column means editing the DDL and its comment in that format** — not the loader.
- `generate_mock.py` reads the same DDL so mock JSON looks like `SELECT *`.
- The API reads column names from `information_schema` at startup and returns rows via `row_to_json`, so a new column appears in API responses without Go changes.
- `vervent_contracts.camber_lease_id` is the one computed column: the lease a deficiency contract (`500012345D`) belongs to (`5000012345`), by Camber's rule. It is added by an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `01_vervent_contracts.sql`, outside `CREATE TABLE`, so the loaders don't see it and `load-schema.sh` adds it to an existing table; `generate_mock.py` computes it with the same rule.
- The DDL is otherwise `CREATE ... IF NOT EXISTS`, so `load-schema.sh` never alters an existing table. Schema changes to a live database need a manual `ALTER TABLE` in addition to the DDL edit. (The `copart_vs_vervent` and `lease_terminations` views are `CREATE OR REPLACE`, so they do update, as long as columns are only added at the end.)

Type/naming conventions and source-data quirks are documented in `vervent/sql/00_README.md`.

### Portfolios: which leases are Camber's

Vervent's files hold every lease it services under its portfolio 50, and many are not Camber's. `portfolio_leases` (`portfolio/sql/02_portfolios.sql`) lists the Camber lease ids that are, each with its portfolio (`portfolios`). `portfolio/load.py` loads it from Camber's own list (`portfolio/*.xlsx`); the list is the whole truth each time, so a lease missing from a newer one loses its portfolio. Servicer-neutral like the snapshots, which is why `portfolio/sql` loads first.

- The API lists the `vervent_contract_list` / `vervent_asset_list` / `vervent_transaction_list` views (`vervent/sql/05_portfolio_views.sql`): each table with `camber_portfolio` as its first column, null for a lease that is not Camber's (`vervent_transactions.portfolio` is Vervent's own, always 50), and on assets and transactions `camber_lease_id` next, so all three lists filter by lease. `/vervent/leases/:leaseId` (`LeaseDetail.jsx`) is a lease under that id: the main contract and its deficiency contracts with their balances added up, and the assets and transactions of all of them; the Camber Lease column links to it. The metrics still count each contract on its own. `lease_terminations` has `camber_portfolio` too, and snapshot contract rows have `lease_id` and `portfolio`. A deficiency contract takes the portfolio of its lease, through `camber_lease_id` (as a function, `vervent_camber_lease_id`, for assets, transactions and staged rows). Mock rows carry the same columns (`generate_mock.py`, plus `portfolios.json`).
- **Everything the dashboard counts is Camber's leases only**: `/api/vervent/metrics`, `/api/servicing/terminations/summary` and `/api/snapshots/history` take `?portfolio=<name>` and otherwise count every row with a portfolio (`inPortfolio` in `be/rest/metrics.go`, both backends). The lists themselves are not restricted: a figure's link carries `camber_portfolio=<name>` or `camber_portfolio.ne=null` (`inPortfolio` in `portfolios.jsx`), and the sidebar and breadcrumbs open the Vervent lists and the terminations with the latter, shown as a removable "Camber's leases" tag. Rows that are not Camber's stay loaded and are listed with `camber_portfolio=null`. Copart pages and the search box are not restricted.
- `05_portfolio_views.sql` drops and recreates the three views in one transaction, so their columns can change freely. A table column added with `ALTER TABLE` shows in its view only after that file runs again (`load-schema.sh`); dropping or retyping a table column needs `DROP VIEW` first.

### Load semantics

Every table carries `source_file`, `file_date` (parsed from the file name), `loaded_at`. Each file loads in one transaction via an all-text staging table, oldest file first. Contracts, assets and both Copart tables upsert on their key guarded by `file_date <=` so an older file never overwrites newer data; transactions are append-only (`ON CONFLICT DO NOTHING`). Re-loading is always safe. Rows that vanish from later files are not deleted. There are no foreign keys (orphans exist and files arrive in any order).

### Portfolio snapshots

A snapshot is a frozen copy of the portfolio at a point in time (`portfolio/sql/01_portfolio_snapshots.sql`): a `portfolio_snapshots` row with the totals as they were, and one `portfolio_snapshot_contracts` row per contract. The tables are **servicer-neutral so they outlive Vervent**: columns are named for what they mean (`contract_no`, `is_open`, `outstanding_receivables`, `days_delinquent`, …) and each contract row keeps the servicer's whole row in `servicer_row` (jsonb). Nothing that reads snapshots uses Vervent column names. The mapping from `vervent_contracts` is `verventColumns` in `be/pipeline/portfolio/snapshot.go`, mirrored by `SNAPSHOT_COLUMNS` in `generate_mock.py`; a new servicer adds a mapping there.

- A snapshot holds the contracts of Camber's leases only (`Capture` joins `portfolio_leases` and fails while it is empty), each with its `lease_id` and `portfolio`. Daily snapshots taken before the lease list was loaded (2026-11) hold every contract and their totals count them all; their rows were labelled afterwards, and the ones without a portfolio are not Camber's. Re-loading one of those files rebuilds its day with Camber's leases only.
- `daily`: the loader takes one from every ContractSummary file, in the file's transaction and from the staged rows, so it is not guarded by `file_date` and re-loading an old file rebuilds that day (same snapshot id). The loader fails if the tables don't exist.
- `manual`: `POST /api/snapshots {name, note}` (the "Take snapshot" button) copies `vervent_contracts` as it stands. Snapshots are create-only.
- Both go through `portfolio.Capture`, which copies the rows and then computes the header totals from them: active = `is_open`; outstanding receivables and past due = sums over open contracts; delinquent = open with `days_delinquent > 0`. **The dashboard's by-day charts and anything by-day read these totals**, not the Vervent tables.
- `/api/snapshots` (`be/rest/snapshots.go`, both backends): the snapshots and `/contracts` (the `portfolio_snapshot_contract_list` view, which leaves out `servicer_row`) speak the list contract; `/history` is the daily totals oldest first (the frozen header totals, or with `?portfolio=` that portfolio's rows totalled); `/{id}/portfolios` is one snapshot's totals per portfolio, computed from its rows; `/{id}/contracts/{contract}` is one row with `servicer_row`. The mock rows are `vervent/mock/portfolio_snapshots.json` and `portfolio_snapshot_contracts.json`, without `servicer_row` (the mock API fills it from `contracts.json`).
- A snapshot with full rows is about 19 MB for ~5,900 contracts, so daily snapshots grow the database by roughly that per file.

The Vervent loader records every run and every file it attempts in `load_runs` / `load_files` (`vervent/sql/04_load_history.sql`, package `be/pipeline/history`): the run row is committed first, a file's `ok` row commits in the same transaction as its data, and a `failed` row is written after the rollback (on a fresh connection if the run was interrupted). A run still `running` means the process died. Copart loads are not recorded yet. The dashboard lists the history under Loads (`/api/loads/runs`, `/api/loads/files`; `Loads.jsx`), with mock rows from `generate_mock.py`. A file's page offers the original for download (`/api/loads/files/{id}/download`, `be/rest/loadfiles.go`): the app pod mounts the SFTP drop box's `vervent/processed` folder read-only as `LOAD_FILES_DIR` and serves the file of that name whose SHA-256 matches the recorded one, so files that never passed through the drop box (Copart, anything deleted from it) have no download.

Keys: `vervent_contracts.lease_no`, `vervent_assets.asset_no`, `vervent_transactions.transaction_key`, `copart_inventory.lot_nbr`, `copart_sales.lot_nbr`. Copart joins to Vervent by VIN (`copart_sales.vin = vervent_assets.serial_number`); one VIN can map to several assets when a vehicle is re-leased.

### Lease terminations

`lease_terminations` (`copart/sql/04_lease_terminations.sql`) is a view with one row per vehicle contract (`class = 'V'`, each has exactly one asset): the contract's terms and status, the Copart lot assigned during or after that lease and before the vehicle's next one, and that lot's sale. It is the part of the Master Servicing lease termination tracker (`backlog/servicing_dashboard`) that Vervent and Copart supply. `stage` (on lease / returned / sold) comes from the Vervent asset status and is provisional, as are the mileage terms (`contr_udf_18`/`contr_udf_19`, unvalidated) and `gain_loss` (net proceeds minus residual). The API serves it under `/api/servicing/terminations` with a `/summary` of units and residual per group (`be/rest/servicing.go`, both backends); the summary returns the dates behind its two maturity groups so the cards can link to exactly the rows counted. The mock rows are `vervent/mock/lease_terminations.json`, which `generate_mock.py` computes with the view's rules and no Copart data: **change the view and that function together.** The page is `/servicing/terminations` (`Terminations.jsx`), with a per-lease page (`TerminationDetail.jsx`) laid out in the tracker's stages that also lists the tracker fields with no source yet.

### Backend (`be/rest`, single `main` package; Go module rooted at `be`)

- `main.go` — routing, Google OIDC sign-in, HMAC-signed stateless session cookie, SPA fallback handler. Access is granted to `AUTH_ALLOWED_EMAILS` or to Workspace accounts whose `hd` claim matches `AUTH_ALLOWED_DOMAIN` (the email suffix alone is deliberately not trusted).
- Two interchangeable implementations of the `verventAPI` interface: `pgstore.go` (Postgres) and `vervent.go` (in-memory mock JSON). **They must stay behaviorally identical** — same routes, same list contract, same metrics (`metrics.go` holds the shared types and the mock computation; `pgstore.go` reimplements it in SQL). A new endpoint needs both, plus a stub in the mock's `copartRoutes` if it is Copart-only.
- `search.go` — `GET /api/search?q=` behind the header search box (`GlobalSearch.jsx`): substring match on lease number and VIN across contracts, assets and Copart inventory, a few rows per group. Implemented for both backends like everything else.
- Generic list contract for every table/view: `?limit=&offset=&sort=col|-col` (nulls last), and any other query param is an exact-match filter on that column's text form (`null` matches NULL). A `.gt`/`.gte`/`.lt`/`.lte`/`.ne` suffix compares instead (`days_del.gt=0`; `.ne` also matches NULL), and `.like` matches values containing the text, ignoring case. `sum=col,col` adds `sums` to the response: each column's total over every row the filters match. Response is `{total, limit, offset, data}`. `format=xlsx` answers instead with every matching row, all columns, as a workbook streamed to the response (`be/rest/xlsx.go`, hand-written so the 128Mi app pod never holds the rows; no xlsx library). Exposing a new table or view is one entry in `openPGVervent` plus two route lines.

### Frontend (`fe/web/app`, React 19 + Ant Design 5 + React Router 7, plain JSX)

- `App.jsx` gates everything on `GET /api/me`, owns the sidebar (`sections`) and top-level routes; `Portfolio.jsx`, `Servicing.jsx`, `Vervent.jsx`, `Copart.jsx` and `Loads.jsx` own their sub-routes.
- `DataTable.jsx` is the one table component: it speaks the list contract above (server-side paging/sort/filter), so a list page is mostly a column definition. With `urlState` (set on every list page's main table, not on tables embedded in detail pages) the page, sort and filters live in the query string, spelled exactly like the API parameters; filters without a value list render as removable tags. Every column is filterable: one with `filters` by picking a value, any other through `ColumnFilters.jsx`, which picks a date range (with This Month / Last Month), a number range or a text search from the column's name and alignment (`filter: 'date' | 'number' | 'text' | false` on the column overrides) and writes `col.gte`/`col.lte`/`col.like`. The table's Excel button downloads the rows the current filters match. `records.jsx` has `useRecord` for detail pages and the cross-link helpers (`contractLink`, `assetLink`, `vinLink`).
- **Every card is actionable and drills down: card → filtered list → single record.** A card or chart mark that shows a figure links (`LinkCard.jsx`, or a `Link` per bar) to the list page of the rows it counts, with the filter expressed in the query string using the same conditions the metric uses, so the list total equals the figure. Every list row links on to its record's detail page. A new metric therefore needs a filter the list contract can express, and a new table needs a detail route.
- The dashboard's two trend charts (`TrendChart.jsx`, hand-drawn SVG, no chart library) plot `/api/snapshots/history`, the daily portfolio snapshots. Each day's point links to that snapshot's page (`/portfolio/snapshots/:id`, `SnapshotDetail.jsx`) filtered with the metric's conditions; the page shows the frozen totals with their formulas and the contract rows, and `DataTable`'s `sums` prop adds a totals row computed by the server, so the rows listed add up to the figure. Its rows link to the contract as the snapshot froze it (`SnapshotContract.jsx`). `/portfolio/snapshots` (`Snapshots.jsx`) lists every snapshot; with `kind=daily` it is the charts as a table. A contract's page lists the daily snapshots it is in.
- All fetches are relative `/api/...` with cookie auth; a 401 triggers a page reload to fall back to the login screen.

### Deployment shape

Single image (`Dockerfile`: Vite build → Go build → distroless) with `STATIC_DIR` pointing at the bundle. The image also carries the Vervent loader as `/app/load-vervent` (`be/pipeline`). `.dockerignore` is an allowlist — only `be` and `fe/web/app` enter the build context, so new top-level directories needed at build time must be added there. Runs in the `camber` namespace on the `aws009` cluster alongside a Postgres 16 StatefulSet (`deploy/k8s`, applied with kustomize).

## Data sensitivity

The Vervent extracts contain lessee personal data. Use `vervent/mock` for examples, tests and screenshots, and don't copy real rows into code, docs or commit messages.
