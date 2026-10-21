# Camber Dashboard

A Go API over the `camber` PostgreSQL database and a React app. The API also
runs **pipeline step 1**: a processor that watches the Vervent drop folder and
stages every new report file into the `vervent` schema (see `../sql`); the
`#/pipeline` route shows what it staged. The pool dashboard views over the
old `camber_credit` schema are still served until they are rebuilt on
`vervent`.

## Running

```sh
# API (requires local PostgreSQL with the camber database loaded)
cd api && go run .                 # listens on :8080, serves ../web/dist if built

# Web — development (hot reload, proxies /api to :8080)
cd web && npm install && npm run dev

# Web — production build (then just the API serves everything)
cd web && npm run build            # open http://localhost:8080
```

Configuration: `DATABASE_URL` overrides the default
`postgres://<user>@localhost:5432/camber`; `ADDR` overrides `:8080`. The API
refuses to start without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (below).

## Sign-in

Sign-in is "Continue with Google", restricted to Camber's Google Workspace:
only verified accounts whose ID token carries `hd = cambercredit.com` (and a
matching `@cambercredit.com` address) get a session. Nobody at Camber
administers anything — their Workspace login is the login.

Flow (`api/auth.go`): `GET /api/auth/google` stores a signed state/PKCE/nonce
cookie and redirects to Google; `GET /api/auth/google/callback` checks the
state, exchanges the code, verifies the ID token (signature, audience,
nonce), applies the domain rule, and sets `camber_session`; `POST
/api/logout` clears it; `GET /api/me` returns `{email, name}`; the data
endpoints require the session. Rejections bounce to `/?auth=<reason>`,
which the login card turns into a message.

`camber_session` is a stateless HMAC-signed cookie (`HttpOnly`, `SameSite=Lax`,
`Secure` when `PUBLIC_URL` is https) that lasts 24 hours and survives API
restarts. There is no server-side revocation; rotating `SESSION_SECRET` signs
everyone out.

Environment:

| Variable | Meaning |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client (required) |
| `PUBLIC_URL` | Origin Google redirects back to; default `http://localhost:5173` (Vite dev). Production: `https://camber.inmatics.io` |
| `AUTH_ALLOWED_DOMAIN` | Workspace domain; default `cambercredit.com` |
| `AUTH_ALLOWED_EMAILS` | Optional comma-separated extra addresses (any Google account) |
| `SESSION_SECRET` | 32+ bytes, hex. Unset → random per start (dev only; restarts sign you out) |
| `VERVENT_INBOX` | Folder the Vervent sFTP files are dropped in (scanned recursively). Default: `../../pipeline/data/inbox` when it exists, else the processor is disabled |
| `VERVENT_POLL` | Scan interval (Go duration, default `60s`; `0` = manual scans only) |

One-time Google Cloud setup, in a project you control (it does not need to be
Camber's — the domain check is done by the API, not by Google):

1. **APIs & Services → OAuth consent screen**: user type *External*, scopes
   `openid`, `email`, `profile` only, then set publishing status to
   **In production**. Those scopes need no Google verification; leaving the
   app in *Testing* would cap sign-ins to 100 hand-listed test users.
2. **Credentials → Create credentials → OAuth client ID**, type *Web
   application*, authorized redirect URIs:
   - `https://camber.inmatics.io/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback` (Vite dev, proxied)
   - `http://localhost:8080/api/auth/google/callback` (production build locally)
3. Export the client ID and secret and run `deployments/create-secrets.sh`.

Local development: `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… go run .` in
`api/`, `npm run dev` in `web/`, open http://localhost:5173. Set
`AUTH_ALLOWED_EMAILS=you@gmail.com` to sign in with a non-Workspace account.

## API

### Pipeline (step 1: Vervent intake)

```
GET  /api/pipeline                    # processor status + last scan, staged files, recent load events
POST /api/pipeline/scan               # scan the inbox now; returns the per-file result (409 if a scan is running)
GET  /api/pipeline/staged/{report}    # staged rows: report = asset_summary | contract_summary | transaction_history
      ?asof=YYYY-MM-DD                #   default: latest as-of staged for that report
      &limit=1..500 & offset=N        #   rows are JSON objects keyed by column; `columns` gives the order
```

The processor (`api/pipeline`) walks the inbox every `VERVENT_POLL`, detects
each file's report type, cadence and as-of date from its name
(`20261019_AssetSummary_Daily_P50.csv`), and loads anything whose name and
sha256 are not already in `vervent.report_file`. A load is one transaction:
header check against the generated column spec, COPY into a temp text
table, registry row, typed upsert via the strict `vervent.parse_*`
functions — any drift or bad value rolls back and is recorded in
`vervent.load_event` (and not retried until the file changes). The column
spec and the generated `pipeline/reports_gen.go` come from
`../sql/generate_schema.py`; `../sql/load.sh` is the manual psql equivalent.

### Pool dashboard (old schema)

One endpoint drives the whole dashboard page so every chart agrees on the slice:

```
GET /api/dashboard?obligor=B|P&condition=N|U&eligible=1
```

Returns pool summary, status composition, delinquency buckets (active leases),
vehicle sales by month, termination outcomes, maturity runoff, and model-year
mix — all scoped by the optional filters. Par values are 9% DCF present values
as of 2026-08-31 from `lease_valuations`.

Two more endpoints drive the drill-down from a chart segment to a lease:

```
GET /api/leases?<dashboard filters>
      &status=0|1|2                  # lease status code
      &bucket=current|1-30|31-60|61-90|90+
      &soldMonth=YYYY-MM
      &termination=<termination type name>
      &maturityQuarter=YYYY QN
      &modelYear=YYYY | modelYearMax=YYYY
      &sort=id|pv|delinquent|maturity|payment & dir=asc|desc
      &limit=1..200 & offset=N
GET /api/leases/{id}
GET /api/leases/{id}/collections
```

The list returns `{total, pvTotal, offset, limit, rows}` for the slice; the
detail returns the full tape row for one lease (contract, vehicle, servicing
snapshot, and both valuations — the same fields as `v_lease_tape`). All
parameters are whitelisted; values travel as bind parameters.

`/collections` returns the lease's month-by-month servicing collections
(`#/lease/{id}/collections` in the app, linked from the lease page): total
cash flow, property/sales tax, payment excluding taxes, end-of-lease fees,
past due, days delinquent, and cumulative payments per as-of month. It reads
the pipeline-built `camber_credit.loan_tape` (see `../pipeline`); on a
database that only has the distribution-tape load it falls back to the
per-snapshot payment figures and reports `"source": "snapshots"`.

## Frontend notes

- Hand-rolled SVG charts (no chart library): column charts, a horizontal bar
  list, and the pool status strip. Mark and color specs follow the dataviz
  reference palette; the categorical slots and the ordinal delinquency ramp
  were run through its validator in both light and dark modes.
- Every chart panel has a Chart/Table toggle (the accessible twin), per-mark
  tooltips with keyboard focus equivalents, and the previous render is held at
  reduced opacity while a filter refetches.
- Dark mode follows `prefers-color-scheme`; a `data-theme="light|dark"`
  attribute on `<html>` overrides it.
- Drill-down: every chart segment and table row opens the underlying lease
  list (`#/leases?…`), and each lease links to its detail page
  (`#/lease/<id>`). Routing is hash-based so the Go file server needs no
  SPA fallback; list state (slice, sort, page) lives in the URL and the
  global obligor/condition/eligible filters carry into the drill.
