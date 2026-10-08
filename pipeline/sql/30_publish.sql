-- =============================================================================
-- Publish the generated loan tape into the camber_credit tables the dashboard
-- reads (see ../../sql/01_schema.sql and dashboard/README.md).
-- Idempotent per as-of date. Variables: asof, discount_rate.
-- =============================================================================

\set ON_ERROR_STOP 1

BEGIN;

-- Vehicles and leases: insert any pool entries not yet present (existing rows
-- from the distribution-tape load are kept verbatim).
INSERT INTO camber_credit.vehicles (vin, model_year, description, fuel_type)
SELECT vin, model_year, yr_make_model, fuel_type::camber_credit.fuel_type
FROM camber_ops.pool
WHERE fuel_type IN ('GASOLINE', 'HYBRID', 'ELECTRIC')
ON CONFLICT (vin) DO NOTHING;

INSERT INTO camber_credit.leases (lease_id, vin, new_used, open_closed,
  obligor_type, is_extended, lease_term_months, lease_date, maturity_date,
  orig_cost, contract_residual_value, payment_regular, alg_model_used, lease_dcf)
SELECT lease_id, vin, new_used, open_closed_lease, business_personal,
  lease_extension, lease_term_months, lease_date, maturity_date,
  orig_cost, contract_residual_value, pmt_reg, alg_model_used, lease_dcf
FROM camber_ops.pool
ON CONFLICT (lease_id) DO NOTHING;

-- Pool cut-off valuations (2025-10-31), for fresh databases.
INSERT INTO camber_credit.lease_valuations
  (lease_id, asof_date, discount_rate, pv_total)
SELECT lease_id, DATE '2025-10-31', 0.09, par_value_9pct_dcf_20251031
FROM camber_ops.pool
WHERE par_value_9pct_dcf_20251031 IS NOT NULL
ON CONFLICT (lease_id, asof_date) DO NOTHING;

-- Monthly servicing snapshot from the loan tape.
INSERT INTO camber_credit.lease_snapshots (lease_id, asof_date, status_code,
  termination_type, termination_timing_category, sold_month,
  net_sales_proceeds, period_payment_collected, days_delinquent,
  payments_remaining, is_eligible_collateral)
SELECT lease_id, asof_date, camber_lease_status,
  CASE WHEN termination_type IN ('Early Payoff', 'Purchase Option Exercised',
         'Repossession / Default', 'Voluntary Return at Maturity')
       THEN termination_type::camber_credit.lease_termination_type END,
  CASE WHEN termination_timing_category IN ('< 3 Months', '3-6 Months',
         '6 - 12 Months', '1 Year+')
       THEN termination_timing_category::camber_credit.termination_timing_category END,
  sold_month, net_sales_proceeds,
  coalesce(period_payment_excl_prop_sales_tax, 0),
  coalesce(days_delinquent, 0), coalesce(n_pmts_remaining, 0),
  coalesce(eligible_flag, false)
FROM camber_credit.loan_tape
WHERE asof_date = :'asof' AND camber_lease_status IS NOT NULL
ON CONFLICT (lease_id, asof_date) DO UPDATE SET
  status_code                 = excluded.status_code,
  termination_type            = excluded.termination_type,
  termination_timing_category = excluded.termination_timing_category,
  sold_month                  = excluded.sold_month,
  net_sales_proceeds          = excluded.net_sales_proceeds,
  period_payment_collected    = excluded.period_payment_collected,
  days_delinquent             = excluded.days_delinquent,
  payments_remaining          = excluded.payments_remaining,
  is_eligible_collateral      = excluded.is_eligible_collateral;

INSERT INTO camber_credit.lease_valuations (lease_id, asof_date, discount_rate,
  pv_total, pv_contract_residual, pv_eligible_collateral)
SELECT lease_id, asof_date, :discount_rate, pv9_total, pv9_residual, pv9_eligible
FROM camber_credit.loan_tape
WHERE asof_date = :'asof' AND pv9_total IS NOT NULL
ON CONFLICT (lease_id, asof_date) DO UPDATE SET
  discount_rate          = excluded.discount_rate,
  pv_total               = excluded.pv_total,
  pv_contract_residual   = excluded.pv_contract_residual,
  pv_eligible_collateral = excluded.pv_eligible_collateral;

COMMIT;

SELECT 'lease_snapshots' AS published, count(*) AS rows
FROM camber_credit.lease_snapshots WHERE asof_date = :'asof'
UNION ALL
SELECT 'lease_valuations', count(*)
FROM camber_credit.lease_valuations WHERE asof_date = :'asof';
