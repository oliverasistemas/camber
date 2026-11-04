# Copart weekly report vs Vervent — discovery findings (2026-11-04)

Source: Copart `Camber_Sales_Inventory_Report` drops of 2026-10-05 and 2026-10-30,
loaded into schema `copart` (see `sql/README.md`), matched by VIN to the
2026-10-20 Vervent asset summary through `copart.sale_vs_vervent`. Brad's
August workbook figures come from the Python-era `camber_ops` tables still in
the local db (`lease_term_report`, `overrides`, as of 2026-08-31).

## Reconciliation of the 173 auctioned lots

| Flag | Lots | Meaning |
|---|---|---|
| match | 148 | Vervent SALE PROCEEDS equals Copart net proceeds to the cent |
| differs | 21 | both have a figure, they disagree (table below) |
| no_vervent_asset | 2 | Copart VIN not in Vervent: both are Vervent data-entry errors (below) |
| not_sold | 2 | ran at auction, gross 0, status READY FOR AUCTION (re-runs, not sales) |

## Two VIN errors in Vervent, not in Copart

1. **Lease 5000020872, 2020 Lincoln Aviator.** Vervent serial number
   `5LM5J7XC7LCL23333`, Copart `5LM5J7XC7LGL23333`. Copart's passes the VIN
   check digit, Vervent's fails it. Proceeds agree (16,410.00, sold 2026-08-21
   at Copart / 2026-08-28 in Vervent).
2. **Lease 5000826177, 2022 Jeep Grand Cherokee.** Brad's lease term report and
   Copart have `1C4RJYE60N8765069` (sold 2026-04-07, net 25,810.00). Vervent
   lists the lease under `1C4JJXP69PW555539`, which is the 2023 Wrangler on
   lease 5000826170 (Copart lot 57409176, ready for auction since 2026-06-11).
   Vervent carries the Wrangler VIN on both leases. Proceeds agree (25,810.00).

With those two corrected, every Copart sale maps to a Vervent lease.

## The 21 lots whose proceeds differ

Brad's August tape already overrides 6 of them with exactly Copart's net
(`camber_sale_proceeds_asof_8/31/26_manual_override`); the other 15 carry
Vervent's figure. Six of the Vervent-higher gaps are round numbers (8,000;
3,400; 2,750; 2,550; 1,850; 250), which suggests Vervent is adding something
(customer payment, insurance, purchase option) rather than mis-keying. Several
Vervent-lower gaps come with cents (3,033.60 vs 24,305; 3,669.20 vs 10,910),
which looks like a partial or different posting. Question for Brad either way.

| Lease | VIN | Copart sale | Copart net | Vervent | Diff | In Brad's Aug tape |
|---|---|---|---|---|---|---|
| 5008400463 | 2C3CDBCK3RR206897 | 2026-08-21 | 24,305.00 | 3,033.60 | +21,271.40 | Copart (overridden) |
| 5000043035 | 1C4HJXFGXNW277465 | 2026-08-21 | 16,450.00 | 5,869.00 | +10,581.00 | Copart (overridden) |
| 5000015771 | 2GC4YRE75N1215356 | 2026-08-21 | 31,459.37 | 23,459.37 | +8,000.00 | Copart (overridden) |
| 5000042865 | 1C4HJXDN0KW533755 | 2026-05-05 | 10,910.00 | 3,669.20 | +7,240.80 | Vervent |
| 5000843655 | 1C4RJYD65P8807546 | 2026-05-14 | 25,855.00 | 31,654.66 | -5,799.66 | Copart (overridden) |
| 5000400299 | 1C6JJTBG3PL546515 | 2026-07-10 | 30,305.00 | 34,608.37 | -4,303.37 | Vervent |
| 5000843368 | 1C4JJXP63PW555696 | 2026-05-21 | 22,055.00 | 17,773.85 | +4,281.15 | Vervent |
| 5000850188 | 1C4JJXP67PW556219 | 2026-05-14 | 22,055.00 | 18,587.23 | +3,467.77 | Vervent |
| 5000043006 | 3C4NJCBB0KT715434 | 2026-07-01 | 6,855.00 | 3,419.76 | +3,435.24 | Copart (overridden) |
| 5000042604 | 1C4JJXFG9MW842675 | 2026-07-31 | 26,055.00 | 29,455.00 | -3,400.00 | Vervent |
| 5000042727 | 1C4RJKBG8N8525746 | 2026-07-24 | 21,805.00 | 24,555.00 | -2,750.00 | Vervent |
| 5000022703 | 1C4HJXEN4MW601573 | 2026-09-11 | 17,505.00 | 20,055.00 | -2,550.00 | Vervent |
| 5000043333 | 1C4RJHAG9PC517773 | 2026-07-01 | 23,555.00 | 21,137.21 | +2,417.79 | Copart (overridden) |
| 5000045221 | 1C4HJXEN8NW195217 | 2026-05-29 | 27,555.00 | 29,405.00 | -1,850.00 | Vervent |
| 5000843704 | 1C4JJXR68PW528863 | 2026-08-20 | 23,805.00 | 21,981.74 | +1,823.26 | Vervent |
| 5000850220 | 1C4JJXP6XPW557400 | 2026-06-09 | 24,795.00 | 23,555.00 | +1,240.00 | Vervent |
| 5000042959 | 1C4RJFBG5NC121579 | 2026-09-03 | 20,400.00 | 19,200.00 | +1,200.00 | Vervent |
| 5000043369 | 1C4RJHDG7P8741445 | 2026-05-15 | 29,805.00 | 28,815.19 | +989.81 | Vervent |
| 5000043962 | 3C4NJDBN4PT524445 | 2026-04-07 | 14,810.00 | 15,639.62 | -829.62 | Vervent |
| 5000032415 | 1C4HJXDGXNW152422 | 2026-06-11 | 24,060.00 | 24,310.00 | -250.00 | Vervent |
| 5000042560 | 1C4HJXCG1MW838011 | 2026-09-11 | 23,150.00 | 22,967.34 | +182.66 | Vervent |

## Other observations for the tape later (no action now)

- Copart `sale_date` and Vervent `SOLD DATE` fall in different months for 81
  of the 169 matched sales (Vervent posts days to weeks later). Which one
  drives "sold month" is a tape decision.
- Brad's 21 `sold_month` overrides in the August workbook are, with one
  exception (5000015771), leases with no Copart sale at all, so they are not a
  Copart-vs-Vervent effect.
- The weekly file is cumulative (0 lots dropped between the two drops), so one
  load of the newest file covers everything since the February takeover.
  Earlier files only add status history.
