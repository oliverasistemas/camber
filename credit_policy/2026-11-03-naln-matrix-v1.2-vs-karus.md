# NALN Lending Guidelines Matrix V1.2 (eff. 10/26/26) vs. what Karus is running

Context: Eddie Nevarez (NALN) emailed 11/2 with the V1.2 matrix and app 1277877
as an example of callbacks not matching the program. Meeting Wed 11/4. He asked
us to review callbacks against the matrix and identify discrepancies before then.

Sources used: the V1.2 PDF, the five CAMBER counter emails in the repo root,
`lue/requests/CMB1-H4GHYWVFT348QJEC-B` (a raw Karus response), the June 2026
Karus program guide (`spreadsheets/Karus - Camber Program Guide (NALN) 2026.06`),
and the rules Karus confirmed in the 10/22 "Batch #2" thread with Kim.

The LUE request/response logs are in the CLUE console (TRC-hosted, Amplify).

## 1. App 1277877 (camber key CMB1-W4EP01HN6N893MH9-9)

Source: CLUE console, https://main.d2mke4wtq4ekqx.amplifyapp.com/applications/CMB1-W4EP01HN6N893MH9-9
(five runs, raw APP/AUD/AUA/RSP for each). Applicant, income, vehicle and TU
pull are identical on all five runs; only the requested term and rate change.

Applicant: FICO 717, income 5,235.35/mo, rent 1,000, non-permanent resident,
SD address, NM license. Vehicle: 2019 Ram 1500, 89,125 mi, wholesale 33,550,
retail 37,550. Payoff 41,524.

| Run | Received | Requested | Karus decision | Reasons |
|---|---|---|---|---|
| Original | 10/28 6:44 PM | 41,524 @ 72 mo, rate 0 | COUNTER 41,471.40 @ 70 mo 10%, pmt 784.35, LTV 123.61 | PTI exceeds; term reduced; rate adjusted |
| Rehash 1 | 10/28 6:55 PM | 41,534 @ 72 mo 10% | same counter | PTI exceeds; term reduced |
| Rehash 2 | 10/29 12:04 PM | 41,534 @ 70 mo 10% | same counter | PTI exceeds; term reduced |
| Rehash 3 | 11/2 7:20 PM | 41,534 @ 83 mo 10.49% | HARD DECLINE | "Debt-to-income ratio exceeds program limits" |
| Rehash 4 | 11/2 7:29 PM | 41,534 @ 84 mo 10.49% | HARD DECLINE | same |

What the numbers say:

- **Valuation.** Karus's LTV is on wholesale: 41,471.40 / 33,550 = 123.61,
  and the AUA carries `VEHICLE_WHOLESALE_VALUE: 33550`. NALN sends
  `retailValue: 37550` in the same request and Karus ignores it. On retail
  the LTV is 110.6%.
- **The $62.60 haircut is Karus's 15% PTI cap.** 41,534 at 70 mo 10% is a
  785.53 payment = 15.005% of 5,235.35. Karus trimmed the loan until the
  payment was 784.35 = 14.98%. V1.2 gives Tier 1 (700–739) a 20% PTI, so
  under NALN's matrix PTI is not binding at any term.
- **Term 70 is Karus's cap for this vehicle** ("Loan term reduced to meet
  program limits"), applied even when NALN asked for 72. Karus caps at 75
  and steps down by age/mileage; a 7-model-year, 89k-mile truck lands at 70.
  V1.2 allows 84 on amount financed >= 25,000.
- **The DTI decline is a term-cap artifact, not a DTI change.** Nothing in
  the application differs between rehash 2 (counter) and rehashes 3 and 4
  (decline) except term 70 -> 83/84 and rate 10 -> 10.49. The payment at 84
  mo is 700.07 (13.4% PTI), lower than the countered 784.35, so DTI cannot
  have gotten worse. When the requested term is above Karus's max, the
  engine hard-declines and labels it DTI instead of countering down to the
  max term as it did for 72. This is a Karus bug or a program setting that
  needs to change; either way it is the question for Thom.
- Callbacks always return a single term (Min Term = Max Term). "Approved for
  up to 84 months" is not something the current response can express.

## 2. The other four counters in hand

| App | FICO | Loan | Term | Rate | LTV | Implied wholesale value |
|---|---|---|---|---|---|---|
| 1286616 | 620 | 25,156.30 | 72 | 15.0 | 130.01 | 19,350 |
| 1300377 | 609 | 15,893.60 | 60 | 15.0 | 118.39 | 13,425 |
| 1303963 | 617 | 30,973.80 | 72 | 15.0 | 130.01 | 23,824 |
| 1305878 | 621 | 13,131.30 | 68 | 15.0 | 130.01 | 10,100 |

Three of four were cut to exactly 130% of wholesale, Karus's cap for its
600–624 band. Under V1.2 these are Tier 5 (600–619) at 120% of retail or
Tier 4 (620–649) at 125% of retail, so the amounts and the basis both differ.
Terms of 60/68/72 are Karus's age/mileage step-downs. 1286616 and 1303963 are
over 25,000 and would be 84-month eligible under V1.2.

## 3. Matrix vs. Karus program, item by item

"Karus" = June 2026 program guide unless marked (10/22), which means confirmed
by Karus in the Batch #2 thread. Items marked ? need Karus to confirm what is
live today.

| Item | NALN V1.2 | Karus | Gap |
|---|---|---|---|
| Credit tiers | 6 tiers: 740+, 700–739, 680–699, 650–679, 620–649, 600–619 | 5 tiers: 700+, 675–699, 650–674, 625–649, 600–624 | Different bands. Every tiered rule below inherits this. |
| Min score | 600 | 600 | OK |
| Value basis | NADA Retail | Wholesale (confirmed by raw response) | **Yes** |
| LTV cap by tier | 135/130/130/125/125/120 % of retail | 140/140/135/135/130 % of wholesale | **Yes**, both basis and numbers |
| Max term | 84; 84 needs AF >= 25,000; 72 needs >= 15,000; 60 needs >= 7,500 | 75, stepping down to 60 by vehicle age/mileage (10/22) | **Yes** |
| Term > 72 | +0.49% rate | n/a | **Yes** |
| Min term | 36 | 12 | Minor |
| Amount financed | 10,000 – 75,000 | 5,000 – 60,000; tier max 60/55/50/45/40k | **Yes** at the top end |
| Max payment | 1,500 | 850 (850/800/750/700/650 by tier) | **Yes** |
| DTI | 50/50/45/45/40/40 | 50/50/50/45/45 (June) ? | Tier mapping differs |
| PTI | 20/20/18/18/16/15 | 15/15/14/13/12 (June) ? | **Yes**, Karus tighter |
| Min income | 1,500 single / 2,500 joint; fixed income grossed up 125% | 3,000 / 3,500 (June) ? | **Yes**, Karus tighter |
| Backend | 20% of payoff + fees up to 6,000; per-product caps | 6,000 flat, no % or per-product cap (10/22) | Minor |
| Mileage | 130,000 | 120,000 (10/22); open item from Kim's 10/22 reply, Russell was to confirm | **Yes** |
| Vehicle age | 10 model years all tiers | 10–15 years by score (10/22) | Karus looser |
| Min vehicle value | 5,000 | 5,000 | OK |
| Time on job / address | 1 month | 3 months (6 for 625–649 and 600–624) | **Yes** |
| Employment / residence history | 2 years | n/a | n/a |
| Joint apps | Higher score used, combined income, no co-signers, need not share address | Must be at same address (June); co-app ZIP mismatch declined app 1414345 (10/22) | **Yes** |
| Inquiries | <= 36 in 12 months | not in guide | ? |
| Bankruptcy | discharged OK; none dismissed in 30 days | no open BK, none in 24 months | **Yes**, Karus tighter |
| Repo / auto charge-off | none in 3 months; no multiple; no auto CO > 15k in 3 yrs | none in 12 months; <= 1 auto CO on record | **Yes**, Karus tighter |
| Auto/mortgage delinquency | max two 30/60 in 12 months; no current 90 | 0 auto trades 90+ in 12 mo; >= 6 months since last auto/mortgage/HELOC delinquency | Different shape |
| Non-auto charge-offs / collections | caps 5,000 / 7,500 aggregate; medical, utility <= 500, disputed excluded | not in guide | ? |
| Credit profile | 6 months history; >= 1 trade (the refi loan); 2,500 high credit | >= 2 tradelines | **Yes** |
| Student loans / child support | 1% of balance if no payment; child support added | not in guide | ? |
| Restricted brands | Aston Martin, Bentley, Ferrari, Fisker, Hummer, Isuzu, Lamborghini, Lotus, Maybach, McLaren, Oldsmobile, Peugeot, Rolls Royce, Saab, Smart | adds Alfa Romeo, Saturn, Suzuki, Maserati, Tesla conditions; lacks Aston Martin | Minor |
| Rates | TBD by tier | 7–15% strat table | NALN has not set rates |
| States | 20 listed | "all states with licenses" | Need the list loaded |
| Military / MLA | not allowed | MLA check at ID stip (NALN side) | n/a |
| Days to first payment | 45, autopay | n/a | n/a |
| Stips | POR only if address differs from ID; POI waived at 650+ | POR fixed on every deal; POI on income > TU estimate + 10% (fix pending) | Known, open from 10/22 |

## 4. What to ask Karus (Thom Muha) before Wednesday

1. Confirm the live program parameters today (the June guide is stale on term
   and mileage already): tiers, LTV basis and caps, max term and the
   age/mileage step-down table, PTI/DTI, min income, max payment, max amount.
2. Can the program switch LTV to the `retailValue` NALN already sends, with the
   V1.2 caps by V1.2 tiers? Both values are in every request.
3. Can max term go to 84 with the amount-financed floors (25k/15k/7.5k) and the
   .49% add-on over 72, keeping or dropping the age/mileage step-down?
4. For 1277877: why does a requested term above the program max (83/84)
   hard-decline as "DTI exceeds" when 72 countered down to 70? Nothing else
   changed between the runs. Expected: counter to the max term, or a decline
   reason that says term.
5. Can the callback carry a term range (min/max) when more than one term
   qualifies, since NALN reads "approved up to N months"?

## 5. What to tell NALN

The engine is not misapplying V1.2. It is applying a different program: the
Karus program drafted in June with Camber, which was never reconciled to the
NALN matrix (V1.2 is dated 10/26, after go-live testing started). The
valuation basis, term cap and LTV caps are all program settings, not bugs.
The 84-month "DTI" decline is the engine hard-declining a term above its
cap instead of countering, with a misleading reason; Karus needs to fix it.
