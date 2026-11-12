-- copart_vs_vervent: each Copart sale next to the Vervent asset with the same VIN, comparing Copart's
-- net_sale_proceeds with Vervent's sale_proceeds. Run after 01/02 and vervent/sql/02_vervent_assets.sql.

CREATE OR REPLACE VIEW copart_vs_vervent AS
SELECT s.lot_nbr,
       s.vin,
       s.year,
       s.make,
       s.model,
       s.sale_date,
       s.sales_status,
       s.gross_sale_price,
       s.total_seller_charges,
       s.net_sale_proceeds,
       a.asset_no,
       a.lease,
       a.description                           AS asset_description,
       a.status                                AS asset_status,
       a.sold_date                             AS vervent_sold_date,
       a.sale_proceeds                         AS vervent_sale_proceeds,
       s.net_sale_proceeds - a.sale_proceeds   AS difference,
       CASE WHEN a.asset_no IS NULL THEN 'not in vervent'
            WHEN coalesce(a.sale_proceeds, 0) = 0 THEN 'no vervent proceeds'
            WHEN abs(s.net_sale_proceeds - a.sale_proceeds) < 0.01 THEN 'match'
            ELSE 'differs' END                 AS comparison
  FROM copart_sales s
  LEFT JOIN LATERAL (
        -- A re-leased vehicle has an asset per lease: take the one sold on or after the Copart
        -- sale, nearest first, else the most recently sold.
        SELECT *
          FROM vervent_assets a
         WHERE a.serial_number = s.vin
         ORDER BY a.sold_date >= s.sale_date DESC NULLS LAST,
                  abs(a.sold_date - s.sale_date) NULLS LAST,
                  a.asset_no DESC
         LIMIT 1) a ON true;

COMMENT ON VIEW copart_vs_vervent IS 'One row per copart_sales lot with the matching vervent_assets row (by VIN) and how Copart net proceeds compare with Vervent SALE PROCEEDS.';
COMMENT ON COLUMN copart_vs_vervent.difference IS 'Copart net_sale_proceeds minus Vervent sale_proceeds, USD. Positive: Vervent booked less than Copart remitted.';
COMMENT ON COLUMN copart_vs_vervent.comparison IS 'match (within 1 cent), differs, no vervent proceeds (asset found, sale_proceeds empty or 0), not in vervent (no asset with this VIN).';
