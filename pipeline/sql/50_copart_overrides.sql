-- =============================================================================
-- Propose sale overrides from Copart remarketing data (step 3).
--
-- Copart's "Camber Sales & Inventory Report" (Sales tab) is the settlement
-- source of truth for auctioned vehicles. Where its net sale proceeds differ
-- from the servicer-reported value on the current tape (or the servicer has
-- no sale at all), emit override rows in the overrides-CSV format for review;
-- save the output and load it with `run.py load-overrides`.
--
-- Variable: asof.
-- =============================================================================

\set ON_ERROR_STOP 1

WITH cop AS (
  -- newest Copart sales row per VIN, up to the as-of month
  SELECT DISTINCT ON (vin) *
  FROM (
    SELECT upper(btrim(vin)) AS vin, asof_date AS report_date, load_seq,
           camber_ops.parse_date(sale_date) AS sale_date,
           camber_ops.parse_num(gross_sale_price) AS gross_sale_price,
           camber_ops.parse_num(net_sale_proceeds) AS net_sale_proceeds,
           btrim(sales_status) AS sales_status
    FROM camber_ops.copart_sales
    WHERE camber_ops.parse_num(net_sale_proceeds) IS NOT NULL
  ) s
  WHERE sale_date <= :'asof'
  ORDER BY vin, report_date DESC, load_seq DESC
),
j AS (
  -- compare against the latest tape at or before the as-of month
  SELECT p.lease_id, p.vin, c.sale_date, c.net_sale_proceeds, c.sales_status,
         t.sold_month, t.vervent_net_sale_proceeds, t.net_sales_proceeds,
         t.sale_proceeds_override
  FROM camber_ops.pool p
  JOIN cop c ON upper(btrim(p.vin)) = c.vin
  LEFT JOIN LATERAL (
    SELECT * FROM camber_credit.loan_tape t
    WHERE t.lease_id = p.lease_id AND t.asof_date <= :'asof'
    ORDER BY t.asof_date DESC LIMIT 1
  ) t ON true
)
SELECT lease_id,
       :'asof'                                   AS asof_date,
       field,
       value,
       'copart'                                  AS source,
       format('Copart sale %s (%s): net proceeds %s vs servicer %s',
              sale_date, sales_status, net_sale_proceeds,
              coalesce(vervent_net_sale_proceeds::text, 'none')) AS reason
FROM j
CROSS JOIN LATERAL (VALUES
  ('sale_proceeds', net_sale_proceeds::text,
     abs(coalesce(vervent_net_sale_proceeds, 0) - net_sale_proceeds) > 1.00
     AND net_sale_proceeds IS DISTINCT FROM sale_proceeds_override),
  ('sold_month', sale_date::text, sold_month IS NULL)
) AS v(field, value, applies)
WHERE applies
ORDER BY lease_id, field;
