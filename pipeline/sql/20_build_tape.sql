-- =============================================================================
-- Build the monthly loan tape for one as-of date.
--
-- Faithful SQL translation of the calculated columns in Brad's monthly
-- collections workbook ("2026-1 <month> (Formulas)" sheet; see the workbook's
-- Field Dictionary). Excel formula references are noted per field as the
-- August column letters (CK..EZ).
--
-- psql variables (set by run.py build):
--   asof, period_start, prior_asof, pool_start          (dates)
--   discount_rate, ppt_rate                             (numerics)
--   eol_mileage_assumption, eol_wear_assumption         (numerics)
-- =============================================================================

\set ON_ERROR_STOP 1

BEGIN;

DELETE FROM camber_credit.loan_tape WHERE asof_date = :'asof';

INSERT INTO camber_credit.loan_tape (
  lease_id, asof_date, under_review, camber_lease_status,
  vervent_lease_status, vervent_asset_status,
  termination_type, prepayment_flag, termination_timing_category,
  vervent_sold_date, sold_month_override, sold_month,
  vervent_net_sale_proceeds, sale_proceeds_override, net_sales_proceeds,
  period_total_cash_flow, period_property_tax, period_sales_tax,
  period_payment_excl_sales_tax, period_payment_excl_prop_sales_tax,
  period_eol_collections, estimated_period_invoices,
  vervent_past_due, past_due_override, past_due_receivables,
  condition_report_available, ltr_found, ltr_eol_ar,
  vervent_eol_mileage, vervent_eol_wear, vervent_eol_disposition,
  vervent_eol_total, est_eol_mileage, est_eol_wear, eol_ar_final,
  eol_ar_exclusion, total_ar_final,
  vervent_days_delinquent, days_delinquent_override, days_delinquent,
  last_payment_date, n_pmts_remaining,
  pv_ly_payments, pv_ly_residual, pv_ly_total,
  pv9_payments, pv9_residual, pv9_total_excl_ppt, ppt_proration, pv9_total,
  eligible_flag, pv9_eligible,
  cum_cash_flow, cum_property_tax, cum_sales_tax, cum_payment_calc,
  proceeds_exceed_collections, cum_payment_final,
  cb_offboarded, par_mom_change, ar_mom_change
)
WITH
pool AS (
  SELECT * FROM camber_ops.pool
),
prior AS (
  SELECT * FROM camber_credit.loan_tape WHERE asof_date = :'prior_asof'
),

-- ---- typed slices of the staged servicer files ------------------------------
asset AS (
  SELECT load_seq, btrim(lease) AS lease, lease_id_norm,
         btrim(coalesce(status, '')) AS status,
         camber_ops.parse_date(sold_date) AS sold_date,
         nullif(btrim(coalesce(sold_date, '')), '') AS sold_date_raw,
         camber_ops.parse_num(sale_proceeds) AS sale_proceeds
  FROM vervent_raw.asset_summary
  WHERE asof_date = :'asof'
),
contract AS (
  SELECT load_seq, btrim(lease_no) AS lease_no, lease_id_norm,
         btrim(coalesce(ls_status, '')) AS ls_status,
         camber_ops.parse_num(days_del) AS days_del,
         camber_ops.parse_num(past_due_receivables) AS past_due,
         camber_ops.parse_date(last_paid_date) AS last_paid_date
  FROM vervent_raw.contract_summary
  WHERE asof_date = :'asof'
),
-- Camber Lease Term Report: first row per idx (Excel XLOOKUP = first match)
ltr AS (
  SELECT DISTINCT ON (lease_id) *
  FROM (
    SELECT camber_ops.parse_num(idx)::bigint AS lease_id, load_seq,
           nullif(btrim(coalesce(termination_type, '')), '') AS termination_type,
           camber_ops.parse_num(prepayment_flag_0_1) AS prepayment_flag,
           nullif(btrim(coalesce(termination_date_vs_maturity_date_category, '')), '') AS timing_category,
           nullif(btrim(coalesce(condition_report_y_n, '')), '') AS condition_report,
           camber_ops.parse_num(accounts_receivable_total) AS ar_total
    FROM camber_ops.lease_term_report
    WHERE asof_date = :'asof' AND camber_ops.parse_num(idx) IS NOT NULL
  ) t
  ORDER BY lease_id, load_seq
),
-- Vervent end-of-term charges: first row per claim (= lease id)
eot AS (
  SELECT DISTINCT ON (lease_id) *
  FROM (
    SELECT camber_ops.parse_num(claim_lpc_accnt)::bigint AS lease_id, load_seq,
           camber_ops.parse_num(mileage_fee_calculation)            AS eol_mileage,
           camber_ops.parse_num(excess_wear_and_tear_includes_tire) AS eol_wear,
           camber_ops.parse_num(disposition_fee_350_00)             AS eol_disposition
    FROM vervent_raw.eot_charges
    WHERE asof_date = :'asof' AND camber_ops.parse_num(claim_lpc_accnt) IS NOT NULL
  ) t
  ORDER BY lease_id, load_seq
),
offboarded AS (
  SELECT DISTINCT camber_ops.parse_num(idx)::bigint AS lease_id
  FROM camber_ops.cb_offboarded_accounts
  WHERE asof_date = :'asof' AND camber_ops.parse_num(idx) IS NOT NULL
),

-- ---- manual overrides for the month (step 3: QC / Copart corrections) -------
ov AS (
  SELECT lease_id,
         camber_ops.parse_date(sold_month_raw) AS sold_month_ov,
         coalesce(to_char(camber_ops.parse_date(sold_month_raw), 'YYYY-MM'),
                  CASE WHEN sold_month_raw ~ '^\d{4}-\d{2}$' THEN sold_month_raw END)
           AS sold_month_ov_txt,
         sale_proceeds_ov, past_due_ov, days_del_ov, eol_excl, under_review,
         lease_status_ov, period_cash_ov, period_pmt_ov
  FROM (
    SELECT lease_id,
         max(value) FILTER (WHERE field = 'sold_month')                            AS sold_month_raw,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'sale_proceeds'))  AS sale_proceeds_ov,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'past_due_receivables')) AS past_due_ov,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'days_delinquent'))      AS days_del_ov,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'lease_status'))::smallint AS lease_status_ov,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'period_cash_flow'))       AS period_cash_ov,
         camber_ops.parse_num (max(value) FILTER (WHERE field = 'period_payment_excl_taxes')) AS period_pmt_ov,
         bool_or(field = 'eol_ar_exclusion' AND upper(value) IN ('Y', 'YES', '1', 'TRUE')) AS eol_excl,
         bool_or(field = 'under_review'     AND upper(value) IN ('Y', 'YES', '1', 'TRUE')) AS under_review
    FROM camber_ops.overrides
    WHERE asof_date = :'asof'
    GROUP BY 1
  ) raw
),

-- ---- per-lease servicer lookups ---------------------------------------------
-- Excel matches asset STATUS / sold date on the raw LEASE number (follow-on
-- contracts like '500069007D' intentionally don't match), but sums SALE
-- PROCEEDS over LEASE_ID_NORM (they do). Mirror both behaviors.
servicer AS (
  SELECT p.lease_id,
    (SELECT a.status FROM asset a
      WHERE a.lease = p.lease_id::text ORDER BY a.load_seq LIMIT 1)   AS asset_status,  -- CN
    (SELECT max(a.sold_date) FROM asset a
      WHERE a.lease = p.lease_id::text)                               AS vervent_sold_date,  -- CS
    (SELECT sum(a.sale_proceeds) FROM asset a
      WHERE a.lease_id_norm = p.lease_id::text
        AND a.sold_date_raw IS NOT NULL)                              AS sale_proceeds_sum,  -- CW (cur_sp)
    (SELECT c.ls_status FROM contract c
      WHERE c.lease_no = p.lease_id::text ORDER BY c.load_seq LIMIT 1) AS ls_status,    -- CM
    (SELECT coalesce(max(c.days_del), 0) FROM contract c
      WHERE c.lease_id_norm = p.lease_id::text)                       AS vervent_days_del,   -- DY
    (SELECT coalesce(sum(c.past_due), 0) FROM contract c
      WHERE c.lease_id_norm = p.lease_id::text)                       AS past_due_sum,       -- DF
    (SELECT max(c.last_paid_date) FROM contract c
      WHERE c.lease_id_norm = p.lease_id::text)                       AS last_payment_date   -- EC
  FROM pool p
),

-- ---- transaction-history aggregates for the period (step 1: collections) ----
-- CZ/DA/DB/DD/DV: cash collected in the period, excluding non-cash
-- G/L adjustments; tax splits keyed on the report's component columns.
trans_agg AS (
  SELECT lease_id_norm,
    sum(amount) FILTER (WHERE NOT noncash_gl)                    AS period_cash,
    sum(amount) FILTER (WHERE ptax <> 0 AND NOT noncash_gl)      AS period_ptax,
    sum(amount) FILTER (WHERE stax <> 0 AND NOT noncash_gl)      AS period_stax,
    sum(amount) FILTER (WHERE eol_fee AND is_non_cash IS DISTINCT FROM 1) AS period_eol
  FROM (
    SELECT lease_id_norm,
           coalesce(camber_ops.parse_num(payment_amount), 0) AS amount,
           coalesce(camber_ops.parse_num(property_tax), 0)  AS ptax,
           coalesce(camber_ops.parse_num(sales_tax), 0)     AS stax,
           camber_ops.parse_num(is_non_cash)                AS is_non_cash,
           (camber_ops.parse_num(is_non_cash) = 1
             AND upper(btrim(coalesce(description, ''))) = 'G/L ADJUSTMENT') AS noncash_gl,
           upper(coalesce(description, '')) ~ 'LEASE FEE [345]' AS eol_fee
    FROM vervent_raw.trans_history
    WHERE asof_date BETWEEN :'period_start' AND :'asof'
      AND camber_ops.parse_date(posted_date) BETWEEN :'period_start' AND :'asof'
  ) t
  GROUP BY 1
),

-- ---- stage 1: lease status, sold month, delinquency -------------------------
s1 AS (
  SELECT p.lease_id, p.vin, p.open_closed_lease, p.maturity_date, p.pmt_reg,
         p.contract_residual_value, p.lease_dcf,
         sv.asset_status, sv.vervent_sold_date, sv.sale_proceeds_sum,
         sv.ls_status, sv.vervent_days_del, sv.past_due_sum, sv.last_payment_date,
         pr.camber_lease_status  AS prior_status,
         pr.sold_month           AS prior_sold_month,
         pr.net_sales_proceeds   AS prior_net_proceeds,
         pr.total_ar_final       AS prior_total_ar,
         pr.pv9_total_excl_ppt   AS prior_pv9_excl_ppt,
         pr.cum_cash_flow        AS prior_cum_cash,
         pr.cum_property_tax     AS prior_cum_ptax,
         pr.cum_sales_tax        AS prior_cum_stax,
         o.sold_month_ov, o.sale_proceeds_ov, o.past_due_ov, o.days_del_ov,
         o.period_pmt_ov,
         coalesce(o.eol_excl, false)     AS eol_excl,
         coalesce(o.under_review, false) AS under_review,
         -- servicer sold date, suppressed when a lease_status override pins
         -- the lease to a non-sold status (Brad's hardcoded-cell equivalent)
         CASE WHEN o.lease_status_ov IS NOT NULL AND o.lease_status_ov <> 2
              THEN NULL ELSE sv.vervent_sold_date END AS eff_sold_date,
         -- CL: override -> sold date -> asset status code map -> prior month
         coalesce(o.lease_status_ov,
           CASE
             WHEN sv.vervent_sold_date IS NOT NULL THEN 2
             ELSE coalesce(ac.camber_flag, pr.camber_lease_status)
           END) AS status,
         -- CV: override -> prior-month stickiness -> servicer sold date
         CASE
           WHEN o.sold_month_ov_txt IS NOT NULL THEN o.sold_month_ov_txt
           WHEN pr.sold_month IS NOT NULL THEN pr.sold_month
           WHEN o.lease_status_ov IS NOT NULL AND o.lease_status_ov <> 2 THEN NULL
           WHEN sv.vervent_sold_date IS NOT NULL THEN to_char(sv.vervent_sold_date, 'YYYY-MM')
         END AS sold_month,
         -- EB: override (even 0) wins over servicer-reported days delinquent
         coalesce(o.days_del_ov, sv.vervent_days_del)::int AS days_del,
         l.lease_id IS NOT NULL AS ltr_found,
         CASE WHEN l.lease_id IS NULL THEN 'MID' ELSE l.termination_type END AS termination_type,  -- CO
         l.prepayment_flag = 1 AS prepayment_flag,                                                 -- CP
         l.timing_category,                                                                        -- CQ
         CASE WHEN l.lease_id IS NULL THEN 'MID' ELSE l.condition_report END AS condition_report,  -- DI
         CASE WHEN l.lease_id IS NOT NULL THEN coalesce(l.ar_total, 0) END   AS ltr_eol_ar,        -- DM
         e.lease_id IS NOT NULL AS eot_found,
         e.eol_mileage, e.eol_wear, e.eol_disposition,
         -- DQ: servicer end-of-lease receivable; blank when it sums to zero
         nullif(coalesce(e.eol_mileage, 0) + coalesce(e.eol_wear, 0)
                + coalesce(e.eol_disposition, 0), 0) AS vervent_eol_total,
         ob.lease_id IS NOT NULL AS cb_offboarded,                                                 -- EZ
         coalesce(o.period_cash_ov, coalesce(t.period_cash, 0)) AS period_cash,                    -- CZ
         coalesce(t.period_ptax, 0) AS period_ptax,                                                -- DA
         coalesce(t.period_stax, 0) AS period_stax,                                                -- DB
         coalesce(t.period_eol, 0)  AS period_eol                                                  -- DV
  FROM pool p
  JOIN servicer sv USING (lease_id)
  LEFT JOIN prior pr USING (lease_id)
  LEFT JOIN ov o USING (lease_id)
  LEFT JOIN ltr l USING (lease_id)
  LEFT JOIN eot e USING (lease_id)
  LEFT JOIN offboarded ob USING (lease_id)
  LEFT JOIN trans_agg t ON t.lease_id_norm = p.lease_id::text
  LEFT JOIN camber_ops.asset_status_codes ac ON ac.code = sv.asset_status
),

-- ---- stage 2: proceeds, receivables, remaining payments ----------------------
s2 AS (
  SELECT s.*,
    -- CW: servicer-reported net sale proceeds (prior month carries forward)
    CASE
      WHEN s.sold_month IS NOT NULL THEN coalesce(s.sale_proceeds_sum, 0)
      WHEN s.prior_sold_month IS NOT NULL THEN s.prior_net_proceeds
    END AS vervent_net_proceeds,
    -- DF/DH: past due; override (even 0) wins
    coalesce(s.past_due_ov,
             CASE WHEN coalesce(s.days_del, 0) <= 0 THEN 0 ELSE s.past_due_sum END
    ) AS past_due_final,
    CASE WHEN coalesce(s.days_del, 0) <= 0 THEN 0 ELSE s.past_due_sum END AS vervent_past_due,
    -- DS/DT: estimated end-of-lease receivables when the servicer has none
    (s.open_closed_lease IS DISTINCT FROM 'O') AND (
       s.sold_month IS NOT NULL OR s.status = 1
       OR (s.eff_sold_date BETWEEN :'pool_start' AND :'asof')
    ) AS eol_est_applies,
    -- ED: scheduled payments remaining (final payment lands a month before maturity)
    CASE
      WHEN s.sold_month IS NOT NULL
        OR :'asof'::date >= (s.maturity_date - interval '1 month')::date THEN 0
      ELSE 12 * (extract(year  from s.maturity_date - interval '1 month')::int
               - extract(year  from :'asof'::date)::int)
             + (extract(month from s.maturity_date - interval '1 month')::int
               - extract(month from :'asof'::date)::int)
             + CASE WHEN extract(day from :'asof'::date)
                       < extract(day from s.maturity_date) THEN 1 ELSE 0 END
    END AS n_pmts,
    (s.maturity_date - :'asof'::date) AS days_to_maturity
  FROM s1 s
),

-- ---- stage 3: final proceeds, AR, par values ---------------------------------
s3 AS (
  SELECT s.*,
    -- CY: manual override (Copart/Manheim settlement) -> servicer -> prior month
    CASE
      WHEN s.sale_proceeds_ov > 0 THEN s.sale_proceeds_ov
      WHEN coalesce(s.vervent_net_proceeds, 0) > 0 THEN s.vervent_net_proceeds
      WHEN coalesce(s.prior_net_proceeds, 0) > 0 THEN s.prior_net_proceeds
      ELSE s.vervent_net_proceeds
    END AS net_proceeds_final,
    CASE WHEN s.vervent_eol_total IS NULL AND s.eol_est_applies
         THEN :eol_mileage_assumption::numeric END AS est_eol_mileage,
    CASE WHEN s.vervent_eol_total IS NULL AND s.eol_est_applies
         THEN :eol_wear_assumption::numeric END AS est_eol_wear,
    -- DU: LTR receivable -> servicer EOT charges -> Camber estimate
    CASE
      WHEN s.ltr_eol_ar IS NOT NULL THEN s.ltr_eol_ar
      WHEN s.vervent_eol_total IS NOT NULL THEN s.vervent_eol_total
      ELSE CASE WHEN s.vervent_eol_total IS NULL AND s.eol_est_applies
                THEN :eol_mileage_assumption::numeric + :eol_wear_assumption::numeric
                ELSE 0 END
    END AS eol_ar_final,
    -- EE/EH: PV of remaining payments (single midpoint discount)
    (s.pmt_reg * n_pmts)
      / (1 + s.lease_dcf * (s.days_to_maturity / 2.0) / 365) AS pv_ly_payments,
    (s.pmt_reg * n_pmts)
      / (1 + :discount_rate * (s.days_to_maturity / 2.0) / 365) AS pv9_payments,
    -- EF/EI: PV of the contract residual
    CASE
      WHEN s.status = 2 OR s.sold_month IS NOT NULL THEN 0
      WHEN :'asof'::date >= s.maturity_date OR n_pmts <= 0 THEN s.contract_residual_value
      ELSE s.contract_residual_value / (1 + s.lease_dcf * s.days_to_maturity / 365.0)
    END AS pv_ly_residual,
    CASE
      WHEN s.status = 2 OR s.sold_month IS NOT NULL THEN 0
      WHEN :'asof'::date >= s.maturity_date OR n_pmts <= 0 THEN s.contract_residual_value
      ELSE s.contract_residual_value / (1 + :discount_rate * s.days_to_maturity / 365.0)
    END AS pv9_residual
  FROM s2 s
),
s4 AS (
  SELECT s.*,
    -- DX: total AR (exclusion flag drops the end-of-lease piece)
    CASE WHEN s.eol_excl THEN s.past_due_final
         ELSE s.eol_ar_final + s.past_due_final END AS total_ar
  FROM s3 s
),
s5 AS (
  SELECT s.*,
    -- EG / EJ: par value by status and termination path
    CASE
      WHEN s.status = 0 THEN s.pv_ly_residual + s.pv_ly_payments + s.total_ar
      WHEN s.status = 1 AND s.termination_type = 'Early Payoff'
        THEN s.pv_ly_residual + s.pv_ly_payments
      WHEN s.status = 1 AND s.open_closed_lease = 'O' THEN s.pv_ly_residual
      WHEN s.status = 1 THEN s.pv_ly_residual + s.pv_ly_payments + s.total_ar
      WHEN s.status = 2 THEN s.total_ar
    END AS pv_ly_total,
    CASE
      WHEN s.status = 0 THEN s.pv9_residual + s.pv9_payments + s.total_ar
      WHEN s.status = 1 AND s.termination_type = 'Early Payoff'
        THEN s.pv9_residual + s.pv9_payments
      WHEN s.status = 1 AND s.open_closed_lease = 'O' THEN s.pv9_residual
      WHEN s.status = 1 THEN s.pv9_residual + s.pv9_payments + s.total_ar
      WHEN s.status = 2 THEN s.total_ar
    END AS pv9_excl_ppt,
    coalesce(s.prior_cum_cash, 0) + s.period_cash AS cum_cash,   -- EO
    coalesce(s.prior_cum_ptax, 0) + s.period_ptax AS cum_ptax,   -- EP
    coalesce(s.prior_cum_stax, 0) + s.period_stax AS cum_stax    -- EQ
  FROM s4 s
),
s6 AS (
  SELECT s.*,
    CASE WHEN s.status IN (0, 1) THEN s.pv9_excl_ppt * :ppt_rate END AS ppt,  -- EK
    coalesce(s.days_del, 0) < 120 AS eligible,                                -- EM
    s.cum_cash - s.cum_ptax - s.cum_stax AS cum_payment_calc,                 -- ER
    -- ES: sold leases whose reported proceeds exceed observed collections
    CASE
      WHEN s.sold_month IS NULL THEN NULL
      WHEN s.net_proceeds_final IS NULL THEN true
      ELSE (s.cum_cash - s.cum_ptax - s.cum_stax) < s.net_proceeds_final
    END AS proceeds_exceed
  FROM s5 s
)
SELECT
  lease_id, :'asof'::date, under_review, status,
  coalesce(nullif(ls_status, ''), 'MID'),
  coalesce(nullif(asset_status, ''), 'MID'),
  termination_type, prepayment_flag, timing_category,
  vervent_sold_date, sold_month_ov, sold_month,
  round(vervent_net_proceeds, 2), sale_proceeds_ov, round(net_proceeds_final, 2),
  round(period_cash, 2), round(period_ptax, 2), round(period_stax, 2),
  round(period_cash - period_stax, 2),                       -- DC
  round(coalesce(period_pmt_ov,
                 period_cash - period_ptax - period_stax), 2),  -- DD (override wins)
  round(period_eol, 2),
  CASE WHEN status = 0 AND maturity_date > :'asof'::date THEN pmt_reg ELSE 0 END,  -- DE
  round(vervent_past_due, 2), past_due_ov, round(past_due_final, 2),
  condition_report, ltr_found, ltr_eol_ar,
  eol_mileage, eol_wear, eol_disposition, vervent_eol_total,
  est_eol_mileage, est_eol_wear, round(eol_ar_final, 2),
  eol_excl, round(total_ar, 2),
  vervent_days_del::int, days_del_ov::int, days_del,
  last_payment_date, n_pmts,
  pv_ly_payments, pv_ly_residual, pv_ly_total,
  pv9_payments, pv9_residual, pv9_excl_ppt, ppt,
  pv9_excl_ppt + coalesce(ppt, 0),                           -- EL
  eligible,
  (pv9_excl_ppt + coalesce(ppt, 0)) * eligible::int,         -- EN
  round(cum_cash, 2), round(cum_ptax, 2), round(cum_stax, 2),
  round(cum_payment_calc, 2), proceeds_exceed,
  round(CASE WHEN proceeds_exceed THEN net_proceeds_final
             ELSE cum_payment_calc END, 2),                  -- ET
  cb_offboarded,
  pv9_excl_ppt - prior_pv9_excl_ppt,                         -- EU
  round(total_ar - prior_total_ar, 2)                        -- EW
FROM s6;

COMMIT;

SELECT asof_date,
       count(*)                                   AS leases,
       count(*) FILTER (WHERE camber_lease_status = 0) AS active,
       count(*) FILTER (WHERE camber_lease_status = 1) AS in_inventory,
       count(*) FILTER (WHERE camber_lease_status = 2) AS sold,
       round(sum(pv9_total), 2)                   AS pv9_total,
       round(sum(pv9_eligible), 2)                AS pv9_eligible,
       round(sum(period_payment_excl_prop_sales_tax), 2) AS period_collections
FROM camber_credit.loan_tape
WHERE asof_date = :'asof'
GROUP BY 1;
