# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Camber Credit portfolio dashboard, live at https://camber.inmatics.io. It shows lease-servicing data from Vervent (contracts, assets, transactions for portfolio "P50") next to Copart auction data (inventory, sales), and reconciles the two. One Go binary serves both the JSON API and the built React SPA; Postgres holds the data, loaded from vendor files by a Go loader (Vervent) and a Python script (Copart).

## Commands

There are no tests and no linter configured. Verify with `go build ./...` / `go vet ./...` in `be` (the Go module root) and `npm run build` in `fe/web/app`.

### Local development

Run the API and Vite side by side; Vite proxies `/api` to `:8080` so cookies stay same-origin.

```sh
# API — must run from be/rest: the default paths for the OAuth client JSON and mock data are relative to it
cd be/rest && SESSION_SECRET=dev go run .

# SPA — http://localhost:5173
cd fe/web/app && npm install && npm run dev
```

- `SESSION_SECRET` is the only required env var. The Google OAuth client JSON (`client_secret_*.json` at the repo root, gitignored) must exist or the API exits at startup.
- Without `DATABASE_URL` the API serves `vervent/mock/*.json` and all Copart endpoints return empty lists. Set `DATABASE_URL` to use Postgres; the API then exits at startup unless every `vervent_*`/`copart_*` table and the `copart_vs_vervent` view exist (`load_runs`/`load_files` are optional: without them the Loads pages are empty).
- Other env: `ADDR`, `FRONTEND_URL`, `GOOGLE_REDIRECT_URL`, `GOOGLE_CLIENT_SECRET_FILE`, `VERVENT_MOCK_DIR`, `STATIC_DIR`, `AUTH_ALLOWED_DOMAIN`, `AUTH_ALLOWED_EMAILS` (see `be/rest/main.go`), and `LOAD_FILES_DIR` (see `be/rest/loadfiles.go`).

### Local Postgres

```sh
for f in vervent/sql/0*.sql copart/sql/0*.sql; do psql -d cambercredit -v ON_ERROR_STOP=1 -f "$f"; done
(cd be && DATABASE_URL=postgres:///cambercredit go run ./pipeline/cmd/load-vervent "$PWD"/../vervent/20261111_*_Daily_P50.csv)
python3 copart/load.py copart/CamberSalesInventorySalesReport_2026-10-05.xlsx   # needs openpyxl
```

The Vervent loader connects with `DATABASE_URL`; `deploy/load-vervent.sh` port-forwards the cluster's Postgres and runs it. `copart/load.py` pipes to the command in `$PSQL` (default `psql -d cambercredit`), which `deploy/load-copart.sh` sets to `kubectl exec -i postgres-0 -- psql ...`.

Regenerate mock data (fully synthetic, derived from the DDL): `python3 vervent/mock/generate_mock.py`.

### Shipping

```sh
deploy/push.sh <new-tag>      # build the image and push to ECR; tags are immutable, always use a fresh one
# bump newTag in deploy/k8s/kustomization.yaml
deploy/deploy.sh              # kubectl apply -k + wait for rollout
```

Commit history follows this as two commits: the change, then "Ship app image X.Y.Z (…)". If a build depends on new tables/views, run `deploy/load-schema.sh` first or the new pod crash-loops. `deploy/README.md` covers cluster access (kubectl needs an SSH tunnel from non-allowlisted IPs), secrets, sign-in allowlist, and loading vendor drops; `deploy/SFTP.md` covers the Vervent SFTP drop box.

## Architecture

### The DDL is the source of truth

`vervent/sql/0*.sql` and `copart/sql/0*.sql` drive everything downstream:

- `vervent/sql` is a symlink to `be/pipeline/vervent/sql`, which lives inside the Go module so the loader can `embed` it (a DDL change needs a rebuild of the loader).
- Each `COMMENT ON COLUMN` starts with the source file's header in `[brackets]`; date columns end with `Source format <fmt>`. The loaders (`be/pipeline/vervent/ddl.go`, `copart/load.py`) parse the DDL with regexes to build the column mapping, and refuse a file whose headers don't match. **Adding or renaming a column means editing the DDL and its comment in that format** — not the loader.
- `generate_mock.py` reads the same DDL so mock JSON looks like `SELECT *`.
- The API reads column names from `information_schema` at startup and returns rows via `row_to_json`, so a new column appears in API responses without Go changes.
- The DDL is `CREATE ... IF NOT EXISTS`, so `load-schema.sh` never alters an existing table. Schema changes to a live database need a manual `ALTER TABLE` in addition to the DDL edit. (The `copart_vs_vervent` view is `CREATE OR REPLACE`, so it does update.)

Type/naming conventions and source-data quirks are documented in `vervent/sql/00_README.md`.

### Load semantics

Every table carries `source_file`, `file_date` (parsed from the file name), `loaded_at`. Each file loads in one transaction via an all-text staging table, oldest file first. Contracts, assets and both Copart tables upsert on their key guarded by `file_date <=` so an older file never overwrites newer data; transactions are append-only (`ON CONFLICT DO NOTHING`). Re-loading is always safe. Rows that vanish from later files are not deleted. There are no foreign keys (orphans exist and files arrive in any order).

The Vervent loader records every run and every file it attempts in `load_runs` / `load_files` (`vervent/sql/04_load_history.sql`, package `be/pipeline/history`): the run row is committed first, a file's `ok` row commits in the same transaction as its data, and a `failed` row is written after the rollback (on a fresh connection if the run was interrupted). A run still `running` means the process died. Copart loads are not recorded yet. The dashboard lists the history under Loads (`/api/loads/runs`, `/api/loads/files`; `Loads.jsx`), with mock rows from `generate_mock.py`. A file's page offers the original for download (`/api/loads/files/{id}/download`, `be/rest/loadfiles.go`): the app pod mounts the SFTP drop box's `vervent/processed` folder read-only as `LOAD_FILES_DIR` and serves the file of that name whose SHA-256 matches the recorded one, so files that never passed through the drop box (Copart, anything deleted from it) have no download.

Keys: `vervent_contracts.lease_no`, `vervent_assets.asset_no`, `vervent_transactions.transaction_key`, `copart_inventory.lot_nbr`, `copart_sales.lot_nbr`. Copart joins to Vervent by VIN (`copart_sales.vin = vervent_assets.serial_number`); one VIN can map to several assets when a vehicle is re-leased.

### Backend (`be/rest`, single `main` package; Go module rooted at `be`)

- `main.go` — routing, Google OIDC sign-in, HMAC-signed stateless session cookie, SPA fallback handler. Access is granted to `AUTH_ALLOWED_EMAILS` or to Workspace accounts whose `hd` claim matches `AUTH_ALLOWED_DOMAIN` (the email suffix alone is deliberately not trusted).
- Two interchangeable implementations of the `verventAPI` interface: `pgstore.go` (Postgres) and `vervent.go` (in-memory mock JSON). **They must stay behaviorally identical** — same routes, same list contract, same metrics (`metrics.go` holds the shared types and the mock computation; `pgstore.go` reimplements it in SQL). A new endpoint needs both, plus a stub in the mock's `copartRoutes` if it is Copart-only.
- `search.go` — `GET /api/search?q=` behind the header search box (`GlobalSearch.jsx`): substring match on lease number and VIN across contracts, assets and Copart inventory, a few rows per group. Implemented for both backends like everything else.
- Generic list contract for every table/view: `?limit=&offset=&sort=col|-col` (nulls last), and any other query param is an exact-match filter on that column's text form (`null` matches NULL). A `.gt`/`.gte`/`.lt`/`.lte`/`.ne` suffix compares instead (`days_del.gt=0`; `.ne` also matches NULL). Response is `{total, limit, offset, data}`. Exposing a new table or view is one entry in `openPGVervent` plus two route lines.

### Frontend (`fe/web/app`, React 19 + Ant Design 5 + React Router 7, plain JSX)

- `App.jsx` gates everything on `GET /api/me`, owns the sidebar (`sections`) and top-level routes; `Vervent.jsx`, `Copart.jsx` and `Loads.jsx` own their sub-routes.
- `DataTable.jsx` is the one table component: it speaks the list contract above (server-side paging/sort/filter), so a list page is mostly a column definition. With `urlState` (set on every list page's main table, not on tables embedded in detail pages) the page, sort and filters live in the query string, spelled exactly like the API parameters; filters without a column control render as removable tags. `records.jsx` has `useRecord` for detail pages and the cross-link helpers (`contractLink`, `assetLink`, `vinLink`).
- **Every card is actionable and drills down: card → filtered list → single record.** A card or chart mark that shows a figure links (`LinkCard.jsx`, or a `Link` per bar) to the list page of the rows it counts, with the filter expressed in the query string using the same conditions the metric uses, so the list total equals the figure. Every list row links on to its record's detail page. A new metric therefore needs a filter the list contract can express, and a new table needs a detail route.
- All fetches are relative `/api/...` with cookie auth; a 401 triggers a page reload to fall back to the login screen.

### Deployment shape

Single image (`Dockerfile`: Vite build → Go build → distroless) with `STATIC_DIR` pointing at the bundle. The image also carries the Vervent loader as `/app/load-vervent` (`be/pipeline`). `.dockerignore` is an allowlist — only `be` and `fe/web/app` enter the build context, so new top-level directories needed at build time must be added there. Runs in the `camber` namespace on the `aws009` cluster alongside a Postgres 16 StatefulSet (`deploy/k8s`, applied with kustomize).

## Data sensitivity

The Vervent extracts contain lessee personal data. Use `vervent/mock` for examples, tests and screenshots, and don't copy real rows into code, docs or commit messages.
