-- Camber Credit 2026-1 — tie-out checks
-- Expected values are the control totals embedded in row 1 of the tape
-- ("CC 2026-1" sheet). PV columns are stored at 6 decimal places, so those
-- sums carry a tolerance of 0.01.
SET search_path TO camber_credit;

-- Row counts: 2,228 leases / vehicles / snapshots; 4,456 valuation rows
SELECT 'row_counts' AS check_name,
       (SELECT COUNT(*) FROM vehicles)          = 2228
   AND (SELECT COUNT(*) FROM leases)            = 2228
   AND (SELECT COUNT(*) FROM lease_snapshots)   = 2228
   AND (SELECT COUNT(*) FROM lease_valuations)  = 4456 AS pass;

-- Control totals
SELECT 'contract_residual_value' AS check_name,
       SUM(contract_residual_value) AS actual, 65970352.88 AS expected,
       ABS(SUM(contract_residual_value) - 65970352.875542650) < 0.01 AS pass
FROM leases
UNION ALL
SELECT 'par_value_9pct_dcf_2025-10-31',
       SUM(pv_total), 89459701.96,
       ABS(SUM(pv_total) - 89459701.960727200) < 0.01
FROM lease_valuations WHERE asof_date = '2025-10-31'
UNION ALL
SELECT 'net_sales_proceeds',
       SUM(net_sales_proceeds), 16321410.13,
       ABS(SUM(net_sales_proceeds) - 16321410.130000000) < 0.01
FROM lease_snapshots WHERE asof_date = '2026-08-31'
UNION ALL
SELECT 'august_payment_excl_tax',
       SUM(period_payment_collected), 2418931.87,
       ABS(SUM(period_payment_collected) - 2418931.870000000) < 0.01
FROM lease_snapshots WHERE asof_date = '2026-08-31'
UNION ALL
SELECT 'par_value_9pct_dcf_contractresidual_2026-08-31',
       SUM(pv_contract_residual), 44847086.49,
       ABS(SUM(pv_contract_residual) - 44847086.494256034) < 0.01
FROM lease_valuations WHERE asof_date = '2026-08-31'
UNION ALL
SELECT 'par_value_9pct_dcf_2026-08-31',
       SUM(pv_total), 65088167.27,
       ABS(SUM(pv_total) - 65088167.271011755) < 0.01
FROM lease_valuations WHERE asof_date = '2026-08-31'
UNION ALL
SELECT 'par_value_9pct_dcf_eligiblecollateral_2026-08-31',
       SUM(pv_eligible_collateral), 63778059.38,
       ABS(SUM(pv_eligible_collateral) - 63778059.378859360) < 0.01
FROM lease_valuations WHERE asof_date = '2026-08-31';

-- Consistency: sold leases (status 2) all have termination data and proceeds
SELECT 'sold_leases_complete' AS check_name,
       COUNT(*) = 0 AS pass
FROM lease_snapshots
WHERE status_code = 2
  AND (termination_type IS NULL OR sold_month IS NULL OR net_sales_proceeds IS NULL);

-- Known tape quirk (expected count = 2): two Active (status 0) leases carry a
-- termination type in the source file. Loaded verbatim.
SELECT 'active_with_termination_type_quirk' AS check_name,
       COUNT(*) AS actual, 2 AS expected, COUNT(*) = 2 AS pass
FROM lease_snapshots
WHERE status_code = 0 AND termination_type IS NOT NULL;
