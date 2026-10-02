# Camber Credit 2026-1 — Pool Dashboard

A small Go API over the `camber` PostgreSQL database (schema `camber_credit`,
see `../sql`) and a React dashboard visualizing the lease pool at the
August 31, 2026 servicing cutoff.

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
`postgres://<user>@localhost:5432/camber`; `ADDR` overrides `:8080`.

## Sign-in

The dashboard sits behind a basic username/password login. Credentials are
plain text, set via `DASH_USER` and `DASH_PASS`; the defaults (when the env
vars are unset) are `russell` / `camber2026`.

`POST /api/login` checks the credentials and sets an `HttpOnly` session
cookie (random token, held in memory — restarting the API signs everyone
out); `POST /api/logout` clears it; `GET /api/dashboard` requires it.

This is development-grade on purpose: plain-text credentials, no TLS, no
rate limiting, no persistence. Don't expose it beyond localhost as-is.

## API

One endpoint drives the whole page so every chart agrees on the slice:

```
GET /api/dashboard?obligor=B|P&condition=N|U&eligible=1
```

Returns pool summary, status composition, delinquency buckets (active leases),
vehicle sales by month, termination outcomes, maturity runoff, and model-year
mix — all scoped by the optional filters. Par values are 9% DCF present values
as of 2026-08-31 from `lease_valuations`.

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
