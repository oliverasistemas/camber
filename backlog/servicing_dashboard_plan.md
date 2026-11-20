# Servicing dashboard plan

From the 2026-11-20 meeting (`meeting_notes_2026-11-20.txt`) and Brad's templates in
`servicing_dashboard/`. Covers Adolfo's action items, ordered by what unblocks what. Next review:
Monday 2026-11-23.

## Where things stand

| Meeting item | State |
|---|---|
| 3.5 Portfolio snapshots, daily and on demand | Shipped in 1.13.0. Export not built. |
| 3.1 Lease termination page | Shipped in 1.12.0 (`/servicing/terminations`): Vervent + Copart fields only. |
| 3.2 Collections, last 30 days | On the dashboard. Current month missing. |
| 3.3 Column filters | Exact-match filters on some columns; no date ranges. |
| Everything else | Not started. |

## Blocked on Brad

| Needed | Blocks |
|---|---|
| List of Camber-owned lease IDs with portfolio labels | Phase 2 (whitelist, portfolios) |
| Cumulative transactions file since 2025-07-01 (Drive link) | Phase 4 |
| Validation rules: cumulative file vs Vervent CSVs | Phase 4 sign-off |
| Prepayment formula | Phase 5, termination scenarios |
| PV formula for the contract residual | Phase 5, present value |
| MMR source until the Manheim API | Phase 6 |

## Phase 1 — no dependencies (target: before Monday)

Built 2026-11-20, not yet shipped. Shipping needs `deploy/load-schema.sh` first (it adds
`camber_lease_id` to `vervent_contracts`).

1. **Collections, current month.** Add `collections_mtd` to `/api/vervent/metrics` (both backends):
   cash transactions from the first of the as-of month to the as-of date. Show it on the
   collections card next to the 30-day figure; link it to the transactions list with the same
   date filter.
2. **Date-range filters.** The list contract already supports `.gte` / `.lte`. Add a date-range
   control to `DataTable` for date columns with This Month and Last Month presets, writing those
   parameters to the query string.
3. **Filters on every column.** Give every column a filter control: a value list for
   low-cardinality columns, a text box for the rest. Needs a contains operator in the list
   contract (both backends) for text columns.
4. **Download to Excel.** A `format=xlsx` variant of the list endpoints that streams every row
   the current filters match, and a Download button on `DataTable`. This covers the lease
   transactions view and snapshot contract rows in one go, and is the first step toward the
   investor loan tape.
5. **Normalized Camber lease ID.** See Phase 2 item 1; the rule can be built and tested now.

## Phase 2 — data foundation (needs Brad's lease list for items 2–4)

1. **Camber lease ID.** Rule from Brad's formula: if the ID ends in a non-digit, drop that
   character and insert `0` after the first character; otherwise unchanged. Checked against the
   2026-11-11 ContractSummary file:
   - 4,845 IDs are ten digits; 1,092 are nine digits plus a letter (1,079 `D`, 13 `P`).
   - The rule maps a suffixed ID onto a ten-digit main lease that exists for 1,046 of the 1,092;
     46 have no main lease in the file.
   - So the Excel formula is right and the Fathom description (drop a leading D) is not.
   - Open: what the `P` suffix means, and how to treat the 46 without a main lease.

   Implement as a `camber_lease_id` column on `vervent_contracts` (generated column) and on the
   snapshot contract rows, so both live data and snapshots can group by it.
2. **Portfolio entity.** New `portfolios` table (name, securitized flag if Brad confirms it is
   needed) and `portfolio_leases` (camber_lease_id → portfolio), loaded from Brad's list.
   Servicer-neutral, like the snapshots. A lease not in the list has no portfolio.
3. **Owned-lease filter.** Everything the dashboard counts is restricted to leases with a
   portfolio: metrics, lists, terminations, and snapshots taken from then on. Keep the
   non-owned rows loaded but hidden behind an explicit filter, so nothing is deleted.
   Existing daily snapshots include all ~5,900 contracts; decide whether to rebuild them
   filtered (re-load the files) or keep them and add portfolio to each row.
4. **Portfolio on the UI.** Portfolio filter on the dashboard and lists; portfolio column on
   contracts, terminations and snapshot rows; totals per portfolio on a snapshot.

## Phase 3 — consolidated lease view

- One page per Camber lease ID: the main contract, its deficiency contracts, and their combined
  assets, transactions and balances.
- Decide with Brad how metrics treat a deficiency contract: counted with its main lease
  (one lease, summed balances) or separately. This changes active-contract counts and
  delinquency, so it needs sign-off before the dashboard figures move.

## Phase 4 — historical transactions (needs Brad's file)

1. Profile the Excel file locally against `vervent_transactions`: columns, key, overlap with the
   daily files since 2026-11-10.
2. Loader for it into `vervent_transactions` with its own `source_file`, append-only, recorded
   in the load history. Rows already loaded from daily files win on key conflict.
3. Validation report per Brad's rules: totals by month and by transaction code, file vs
   database, and file vs the overlapping daily CSVs.
4. Check the Postgres volume before loading; the node disk is at 79%.

## Phase 5 — termination calculations (section 4 of the notes)

Start with what needs no new source, as agreed: collections and termination scenarios.

1. **Manual entry and overrides.** A table of user-entered values per lease (termination date,
   contract residual override, later outreach intent), with who and when. This is the "data
   override layer" in Brad's template, and the first place the dashboard stores user input
   beyond snapshots.
2. **Termination scenarios.** Remaining payments at the termination date (count and dollars);
   prepayment flag once Brad's formula arrives.
3. **Present value.** Remaining payments discounted at the lessor's yield over half the
   remaining term, per the formula in the notes. Residual PV waits for its formula.
4. **Payoff scenarios.** Total payoff amount, LTV, new monthly payment with a loan. Needs the
   loan assumptions (rate, term) from Brad.
5. **Status columns** in the order T-90 / T-60 / T-30 / current, derived from the daily
   snapshots once they carry vehicle status. Today snapshots hold contract fields only, so
   asset status has to be added to them first, and history before that date is unavailable.

## Phase 6 — later

- MMR values at T-90 / T-60 / T-30 and residual loss forecast (residual − MMR): manual entry or
  file upload first, Manheim API after.
- Lessee outreach tracking, once who contacts and at which checkpoints is settled.
- Investor loan tape export from a snapshot.

## Throughout

- **Calculation documentation.** One page in the app (and a source file in the repo) listing
  every figure and field with its formula and source columns; each new calculation is added
  there when it ships.
- **Meeting follow-up.** Email the notes and the open questions below to Brad and Zoe.

## Open questions to send Brad

1. Portfolio names, and whether securitized / non-securitized is a portfolio attribute.
2. Meaning of the `P` suffix, and the 46 suffixed contracts with no main lease.
3. Deficiency contracts in the metrics: merged into the main lease or counted separately.
4. Prepayment rule: repossession-based, more than 90 days before maturity, or both.
5. PV formula for the contract residual.
6. Outreach: who contacts, and at which checkpoints.
7. MMR source before the Manheim API.
8. Loan assumptions for the payoff scenarios.
