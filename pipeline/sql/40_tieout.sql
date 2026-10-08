-- =============================================================================
-- Tie-out: compare the pipeline-built loan tape against the expected values
-- extracted from Brad's workbook (camber_ops.expected_tape).
-- Variable: asof. Money fields compare at +/- 0.011 (tape rounds to cents);
-- PV fields at +/- 0.01; counts and text exact.
-- =============================================================================

\set ON_ERROR_STOP 1

SELECT 'row counts' AS check,
       (SELECT count(*) FROM camber_ops.expected_tape WHERE asof_date = :'asof') AS expected,
       (SELECT count(*) FROM camber_credit.loan_tape  WHERE asof_date = :'asof') AS built;

WITH j AS (
  SELECT t.lease_id,
    -- expected (parsed)
    camber_ops.parse_num(e.camber_lease_status)          AS e_status,
    nullif(btrim(e.vervent_lease_status), '')            AS e_ls_status,
    nullif(btrim(e.vervent_asset_status), '')            AS e_asset_status,
    nullif(btrim(e.termination_type), '')                AS e_term_type,
    nullif(btrim(e.sold_month), '')                      AS e_sold_month,
    camber_ops.parse_num(e.vervent_net_sale_proceeds)    AS e_vnp,
    camber_ops.parse_num(e.net_sales_proceeds)           AS e_nsp,
    camber_ops.parse_num(e.period_total_cash_flow)       AS e_cash,
    camber_ops.parse_num(e.period_property_tax)          AS e_ptax,
    camber_ops.parse_num(e.period_sales_tax)             AS e_stax,
    camber_ops.parse_num(e.period_payment_excl_prop_sales_tax) AS e_pmt,
    camber_ops.parse_num(e.past_due_receivables)         AS e_pastdue,
    camber_ops.parse_num(e.eol_ar_final)                 AS e_eol,
    camber_ops.parse_num(e.total_ar_final)               AS e_ar,
    camber_ops.parse_num(e.days_delinquent)              AS e_days,
    camber_ops.parse_num(e.n_pmts_remaining)             AS e_npmt,
    camber_ops.parse_num(e.pv_ly_payments)               AS e_pvlp,
    camber_ops.parse_num(e.pv_ly_residual)               AS e_pvlr,
    camber_ops.parse_num(e.pv_ly_total)                  AS e_pvlt,
    camber_ops.parse_num(e.pv9_payments)                 AS e_pv9p,
    camber_ops.parse_num(e.pv9_residual)                 AS e_pv9r,
    camber_ops.parse_num(e.pv9_total_excl_ppt)           AS e_pv9x,
    camber_ops.parse_num(e.ppt_proration)                AS e_ppt,
    camber_ops.parse_num(e.pv9_total)                    AS e_pv9,
    camber_ops.parse_num(e.eligible_flag)                AS e_elig,
    camber_ops.parse_num(e.pv9_eligible)                 AS e_pv9e,
    camber_ops.parse_num(e.cum_cash_flow)                AS e_cum,
    camber_ops.parse_num(e.cum_payment_final)            AS e_cumpf,
    camber_ops.parse_num(e.cb_offboarded)                AS e_cb,
    -- built
    t.camber_lease_status::numeric   AS t_status,
    t.vervent_lease_status           AS t_ls_status,
    t.vervent_asset_status           AS t_asset_status,
    t.termination_type               AS t_term_type,
    btrim(t.sold_month)              AS t_sold_month,
    t.vervent_net_sale_proceeds      AS t_vnp,
    t.net_sales_proceeds             AS t_nsp,
    t.period_total_cash_flow         AS t_cash,
    t.period_property_tax            AS t_ptax,
    t.period_sales_tax               AS t_stax,
    t.period_payment_excl_prop_sales_tax AS t_pmt,
    t.past_due_receivables           AS t_pastdue,
    t.eol_ar_final                   AS t_eol,
    t.total_ar_final                 AS t_ar,
    t.days_delinquent::numeric       AS t_days,
    t.n_pmts_remaining::numeric      AS t_npmt,
    t.pv_ly_payments                 AS t_pvlp,
    t.pv_ly_residual                 AS t_pvlr,
    t.pv_ly_total                    AS t_pvlt,
    t.pv9_payments                   AS t_pv9p,
    t.pv9_residual                   AS t_pv9r,
    t.pv9_total_excl_ppt             AS t_pv9x,
    t.ppt_proration                  AS t_ppt,
    t.pv9_total                      AS t_pv9,
    t.eligible_flag::int::numeric    AS t_elig,
    t.pv9_eligible                   AS t_pv9e,
    t.cum_cash_flow                  AS t_cum,
    t.cum_payment_final              AS t_cumpf,
    t.cb_offboarded::int::numeric    AS t_cb
  FROM camber_ops.expected_tape e
  JOIN camber_credit.loan_tape t
    ON t.lease_id = camber_ops.parse_num(e.lease_id)::bigint
   AND t.asof_date = e.asof_date
  WHERE e.asof_date = :'asof'
),
long AS (
  SELECT j.lease_id, v.field, v.ok, v.diff
  FROM j
  CROSS JOIN LATERAL (VALUES
    ('01 camber_lease_status', e_status IS NOT DISTINCT FROM t_status,              abs(e_status - t_status)),
    ('02 vervent_lease_status', e_ls_status IS NOT DISTINCT FROM t_ls_status,       NULL::numeric),
    ('03 vervent_asset_status', e_asset_status IS NOT DISTINCT FROM t_asset_status, NULL),
    ('04 termination_type',    e_term_type IS NOT DISTINCT FROM t_term_type,        NULL),
    ('05 sold_month',          e_sold_month IS NOT DISTINCT FROM t_sold_month,      NULL),
    ('06 vervent_net_sale_proceeds', coalesce(abs(e_vnp - t_vnp) <= 0.011, e_vnp IS NULL AND t_vnp IS NULL), abs(e_vnp - t_vnp)),
    ('07 net_sales_proceeds',  coalesce(abs(e_nsp - t_nsp) <= 0.011, e_nsp IS NULL AND t_nsp IS NULL), abs(e_nsp - t_nsp)),
    ('08 period_total_cash_flow', coalesce(abs(e_cash - t_cash) <= 0.011, e_cash IS NULL AND t_cash IS NULL), abs(e_cash - t_cash)),
    ('09 period_property_tax', coalesce(abs(e_ptax - t_ptax) <= 0.011, e_ptax IS NULL AND t_ptax IS NULL), abs(e_ptax - t_ptax)),
    ('10 period_sales_tax',    coalesce(abs(e_stax - t_stax) <= 0.011, e_stax IS NULL AND t_stax IS NULL), abs(e_stax - t_stax)),
    ('11 period_payment_excl_taxes', coalesce(abs(e_pmt - t_pmt) <= 0.011, e_pmt IS NULL AND t_pmt IS NULL), abs(e_pmt - t_pmt)),
    ('12 past_due_receivables', coalesce(abs(e_pastdue - t_pastdue) <= 0.011, e_pastdue IS NULL AND t_pastdue IS NULL), abs(e_pastdue - t_pastdue)),
    ('13 eol_ar_final',        coalesce(abs(e_eol - t_eol) <= 0.011, e_eol IS NULL AND t_eol IS NULL), abs(e_eol - t_eol)),
    ('14 total_ar_final',      coalesce(abs(e_ar - t_ar) <= 0.011, e_ar IS NULL AND t_ar IS NULL), abs(e_ar - t_ar)),
    ('15 days_delinquent',     e_days IS NOT DISTINCT FROM t_days,                  abs(e_days - t_days)),
    ('16 n_pmts_remaining',    e_npmt IS NOT DISTINCT FROM t_npmt,                  abs(e_npmt - t_npmt)),
    ('17 pv_ly_payments',      coalesce(abs(e_pvlp - t_pvlp) <= 0.01, e_pvlp IS NULL AND t_pvlp IS NULL), abs(e_pvlp - t_pvlp)),
    ('18 pv_ly_residual',      coalesce(abs(e_pvlr - t_pvlr) <= 0.01, e_pvlr IS NULL AND t_pvlr IS NULL), abs(e_pvlr - t_pvlr)),
    ('19 pv_ly_total',         coalesce(abs(e_pvlt - t_pvlt) <= 0.01, e_pvlt IS NULL AND t_pvlt IS NULL), abs(e_pvlt - t_pvlt)),
    ('20 pv9_payments',        coalesce(abs(e_pv9p - t_pv9p) <= 0.01, e_pv9p IS NULL AND t_pv9p IS NULL), abs(e_pv9p - t_pv9p)),
    ('21 pv9_residual',        coalesce(abs(e_pv9r - t_pv9r) <= 0.01, e_pv9r IS NULL AND t_pv9r IS NULL), abs(e_pv9r - t_pv9r)),
    ('22 pv9_total_excl_ppt',  coalesce(abs(e_pv9x - t_pv9x) <= 0.01, e_pv9x IS NULL AND t_pv9x IS NULL), abs(e_pv9x - t_pv9x)),
    ('23 ppt_proration',       coalesce(abs(e_ppt - t_ppt) <= 0.01, e_ppt IS NULL AND t_ppt IS NULL), abs(e_ppt - t_ppt)),
    ('24 pv9_total',           coalesce(abs(e_pv9 - t_pv9) <= 0.01, e_pv9 IS NULL AND t_pv9 IS NULL), abs(e_pv9 - t_pv9)),
    ('25 eligible_flag',       e_elig IS NOT DISTINCT FROM t_elig,                  NULL),
    ('26 pv9_eligible',        coalesce(abs(e_pv9e - t_pv9e) <= 0.01, e_pv9e IS NULL AND t_pv9e IS NULL), abs(e_pv9e - t_pv9e)),
    ('27 cum_cash_flow',       coalesce(abs(e_cum - t_cum) <= 0.011, e_cum IS NULL AND t_cum IS NULL), abs(e_cum - t_cum)),
    ('28 cum_payment_final',   coalesce(abs(e_cumpf - t_cumpf) <= 0.011, e_cumpf IS NULL AND t_cumpf IS NULL), abs(e_cumpf - t_cumpf)),
    ('29 cb_offboarded',       (e_cb > 0) IS NOT DISTINCT FROM (t_cb > 0),          NULL)
  ) AS v(field, ok, diff)
)
SELECT field,
       count(*)                                   AS n,
       count(*) FILTER (WHERE NOT coalesce(ok, false)) AS mismatches,
       round(max(diff) FILTER (WHERE NOT coalesce(ok, false)), 4) AS max_abs_diff,
       (array_agg(lease_id ORDER BY lease_id)
          FILTER (WHERE NOT coalesce(ok, false)))[1:5] AS sample_leases
FROM long
GROUP BY field
ORDER BY field;
