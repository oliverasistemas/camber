-- lease_terminations: one row per vehicle contract (class V) with its asset, the Copart lot the vehicle
-- went to after this lease and that lot's sale: the loaded part of the Master Servicing lease termination
-- tracker. Run after 01/02, vervent/sql/01-02 and portfolio/sql/02.
--
-- CREATE OR REPLACE can add columns at the end but not rename, retype, reorder or drop one: for that,
-- DROP VIEW lease_terminations first.

CREATE OR REPLACE VIEW lease_terminations AS
WITH v AS (
    -- Every vehicle contract has exactly one asset. A re-leased vehicle has a contract per lease, so
    -- next_lease_date bounds the time in which a Copart lot belongs to this lease.
    SELECT c.*,
           a.asset_no,
           a.serial_number,
           a.eheld_lessee,
           a.eheld_return,
           a.model,
           a.status,
           a.curr_repo_status,
           a.curr_repo_status_date,
           a.sold_date,
           a.sale_proceeds,
           lead(c.lease_date) OVER (PARTITION BY a.serial_number ORDER BY c.lease_date, c.lease_no) AS next_lease_date,
           -- CONTR UDF 18/19 are unvalidated tape values; anything that is not a plausible allowance or
           -- per-mile rate is dropped.
           CASE WHEN c.contr_udf_18 BETWEEN 1000 AND 50000 THEN c.contr_udf_18::integer END AS annual_mileage_allowance,
           CASE WHEN c.contr_udf_19 ~ '^[0-9]*\.[0-9]+$'
                THEN CASE WHEN c.contr_udf_19::numeric > 0 AND c.contr_udf_19::numeric < 5
                          THEN c.contr_udf_19::numeric(6,2) END END AS mileage_overage_rate
      FROM vervent_contracts c
      JOIN vervent_assets a ON a.lease = c.lease_no
     WHERE c.class = 'V'
), t AS (
    SELECT v.*,
           round(v.annual_mileage_allowance * v.term / 12.0)::integer AS total_mileage_allowance,
           i.lot_nbr,
           i.inventory_status,
           i.order_received_date,
           i.days_in_yard,
           i.physical_location,
           i.auto_grade_score,
           i.title_status,
           i.reserve_amount_on_final_auction,
           i.nada_acv_value,
           i.proquote,
           NULLIF(i.odometer, 0)              AS odometer,
           -- greatest() skips nulls, so an unknown odometer or allowance needs its own check.
           CASE WHEN i.odometer > 0 AND v.annual_mileage_allowance IS NOT NULL
                THEN greatest(i.odometer - round(v.annual_mileage_allowance * v.term / 12.0)::integer, 0) END AS excess_miles,
           s.lot_nbr                          AS sale_lot_nbr,
           s.sale_date,
           s.runs_at_auction,
           s.gross_sale_price,
           s.total_seller_charges,
           s.net_sale_proceeds
      FROM v
      LEFT JOIN LATERAL (
            -- The latest lot assigned to Copart during or after this lease and before the next one.
            SELECT *
              FROM copart_inventory i
             WHERE i.vin = v.serial_number
               AND i.order_assignment_date >= v.lease_date
               AND (v.next_lease_date IS NULL OR i.order_assignment_date < v.next_lease_date)
             ORDER BY i.order_assignment_date DESC, i.lot_nbr DESC
             LIMIT 1) i ON true
      LEFT JOIN copart_sales s ON s.lot_nbr = i.lot_nbr
)
SELECT lease_no,
       asset_no,
       serial_number                             AS vin,
       eheld_lessee                              AS model_year,
       eheld_return                              AS make,
       model,
       first_asset_desc                          AS vehicle,
       lessee_name,
       lessee_state,
       term,
       lease_date,
       maturity_date,
       orig_cost,
       tot_residual                              AS residual,
       curr_pymt::numeric(18,2)                  AS payment,
       lessor_yield,
       CASE WHEN status = 'USLD' THEN 'sold'
            WHEN status IN ('URIN', 'NRIV') THEN 'returned'
            ELSE 'on lease' END                  AS stage,
       account_status,
       ls_status,
       ls_status_date,
       status                                    AS asset_status,
       curr_repo_status                          AS repo_status,
       curr_repo_status_date                     AS repo_status_date,
       closed_date_key                           AS termination_date,
       closed_date_key - maturity_date           AS days_vs_maturity,
       closed_date_key < maturity_date           AS early_termination,
       est_payoff,
       remaining_receivables,
       total_past_due,
       days_del,
       annual_mileage_allowance,
       total_mileage_allowance,
       mileage_overage_rate,
       odometer,
       excess_miles,
       (excess_miles * mileage_overage_rate)::numeric(18,2) AS excess_mileage_fee,
       lot_nbr,
       inventory_status                          AS copart_status,
       order_received_date                       AS copart_received_date,
       days_in_yard,
       physical_location                         AS copart_location,
       auto_grade_score,
       title_status,
       reserve_amount_on_final_auction           AS reserve_amount,
       nada_acv_value,
       proquote,
       runs_at_auction,
       coalesce(sale_date, sold_date)            AS sale_date,
       CASE WHEN sale_lot_nbr IS NOT NULL THEN 'Copart'
            WHEN status = 'USLD' THEN 'Other' END AS sale_channel,
       gross_sale_price,
       total_seller_charges                      AS sale_fees,
       net_sale_proceeds                         AS copart_net_proceeds,
       sale_proceeds                             AS vervent_sale_proceeds,
       coalesce(net_sale_proceeds, NULLIF(sale_proceeds, 0))                          AS net_sale_proceeds,
       coalesce(net_sale_proceeds, NULLIF(sale_proceeds, 0)) - NULLIF(tot_residual, 0) AS gain_loss,
       (SELECT pl.portfolio FROM portfolio_leases pl WHERE pl.lease_id = t.camber_lease_id) AS camber_portfolio
  FROM t;

COMMENT ON VIEW lease_terminations IS 'One row per vehicle contract (vervent_contracts.class = V) with its asset, the Copart lot the vehicle went to after this lease and that lot''s sale. The columns of the Master Servicing lease termination tracker that Vervent and Copart supply.';
COMMENT ON COLUMN lease_terminations.model_year IS 'Vehicle model year, from the mislabelled vervent_assets.eheld_lessee.';
COMMENT ON COLUMN lease_terminations.make IS 'Vehicle make, from the mislabelled vervent_assets.eheld_return.';
COMMENT ON COLUMN lease_terminations.stage IS 'Provisional stage from the Vervent asset status: sold (USLD), returned (URIN, NRIV), else on lease.';
COMMENT ON COLUMN lease_terminations.termination_date IS 'Date the contract closed (ClosedDateKey); empty while it is open.';
COMMENT ON COLUMN lease_terminations.days_vs_maturity IS 'termination_date minus maturity_date, days. Negative: terminated early.';
COMMENT ON COLUMN lease_terminations.annual_mileage_allowance IS 'Miles per year from CONTR UDF 18 (unvalidated tape value); empty outside 1,000-50,000.';
COMMENT ON COLUMN lease_terminations.total_mileage_allowance IS 'annual_mileage_allowance x term / 12, miles.';
COMMENT ON COLUMN lease_terminations.mileage_overage_rate IS 'USD per excess mile from CONTR UDF 19 (unvalidated tape value); empty unless a decimal under 5.';
COMMENT ON COLUMN lease_terminations.odometer IS 'Copart odometer at check-in, miles; empty when not recorded.';
COMMENT ON COLUMN lease_terminations.excess_miles IS 'odometer minus total_mileage_allowance, floored at 0. Mileage at lease start is not known, so it counts as 0.';
COMMENT ON COLUMN lease_terminations.excess_mileage_fee IS 'excess_miles x mileage_overage_rate, USD.';
COMMENT ON COLUMN lease_terminations.lot_nbr IS 'The latest Copart lot assigned on or after lease_date and before the vehicle''s next lease, if any.';
COMMENT ON COLUMN lease_terminations.sale_date IS 'Copart sale date, else the Vervent SOLD DATE.';
COMMENT ON COLUMN lease_terminations.sale_channel IS 'Copart when the lot has a Copart sale; Other for any other sold asset.';
COMMENT ON COLUMN lease_terminations.net_sale_proceeds IS 'Copart net proceeds, else Vervent SALE PROCEEDS when not 0, USD.';
COMMENT ON COLUMN lease_terminations.camber_portfolio IS 'Camber portfolio of the lease (portfolio_leases); empty for a lease that is not Camber''s.';
COMMENT ON COLUMN lease_terminations.gain_loss IS 'Provisional: net_sale_proceeds minus the contract residual, USD.';
