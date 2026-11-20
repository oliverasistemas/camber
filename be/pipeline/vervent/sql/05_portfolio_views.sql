-- vervent_contract_list / vervent_asset_list / vervent_transaction_list: the three tables with
-- camber_portfolio, the Camber portfolio of the row's lease (portfolio/sql/02_portfolios.sql).
-- It is empty for a lease that is not Camber's. These are what the API lists, so every list can be
-- filtered by portfolio and the dashboard can count Camber's leases only. Run after 01-03 and
-- portfolio/sql.
--
-- A deficiency contract, its assets and its transactions carry the portfolio of the lease they
-- follow: the join is on the Camber lease id (vervent_camber_lease_id, 01_vervent_contracts.sql).
-- The asset and transaction views carry that id too, as camber_lease_id (the contracts table has
-- it already), so a lease's page can list everything under the lease and its follow-on contracts.
--
-- The views are dropped and created again, in one transaction, rather than replaced: they select
-- every column of their table, and CREATE OR REPLACE refuses a view whose columns moved. After an
-- ALTER TABLE on one of the tables, run this file again (load-schema.sh does) for the view to
-- follow. Dropping or retyping a table column still needs the view dropped first.

BEGIN;

DROP VIEW IF EXISTS vervent_contract_list, vervent_asset_list, vervent_transaction_list;

CREATE VIEW vervent_contract_list AS
SELECT pl.portfolio AS camber_portfolio, c.*
  FROM vervent_contracts c
  LEFT JOIN portfolio_leases pl ON pl.lease_id = c.camber_lease_id;

CREATE VIEW vervent_asset_list AS
SELECT pl.portfolio AS camber_portfolio, vervent_camber_lease_id(a.lease) AS camber_lease_id, a.*
  FROM vervent_assets a
  LEFT JOIN portfolio_leases pl ON pl.lease_id = vervent_camber_lease_id(a.lease);

CREATE VIEW vervent_transaction_list AS
SELECT pl.portfolio AS camber_portfolio, vervent_camber_lease_id(t.contract_number) AS camber_lease_id, t.*
  FROM vervent_transactions t
  LEFT JOIN portfolio_leases pl ON pl.lease_id = vervent_camber_lease_id(t.contract_number);

COMMENT ON VIEW vervent_contract_list IS 'vervent_contracts with camber_portfolio, the Camber portfolio of the contract''s lease.';
COMMENT ON VIEW vervent_asset_list IS 'vervent_assets with camber_portfolio, the Camber portfolio of the asset''s lease.';
COMMENT ON VIEW vervent_transaction_list IS 'vervent_transactions with camber_portfolio, the Camber portfolio of the transaction''s lease. Not the servicer''s own portfolio column, which is always 50.';
COMMENT ON COLUMN vervent_contract_list.camber_portfolio IS 'Camber portfolio of the lease (portfolio_leases); empty for a lease that is not Camber''s.';
COMMENT ON COLUMN vervent_asset_list.camber_portfolio IS 'Camber portfolio of the lease (portfolio_leases); empty for a lease that is not Camber''s.';
COMMENT ON COLUMN vervent_transaction_list.camber_portfolio IS 'Camber portfolio of the lease (portfolio_leases); empty for a lease that is not Camber''s.';
COMMENT ON COLUMN vervent_asset_list.camber_lease_id IS 'Camber lease id of the asset''s lease: a deficiency contract''s asset carries the id of the lease it follows.';
COMMENT ON COLUMN vervent_transaction_list.camber_lease_id IS 'Camber lease id of the transaction''s contract: a deficiency contract''s transaction carries the id of the lease it follows.';

COMMIT;

-- Snapshot rows taken before portfolio_snapshot_contracts had lease_id: fill it in by the same
-- rule, so portfolio/load.py can label them with their portfolio. Does nothing once they are filled.
UPDATE portfolio_snapshot_contracts sc
   SET lease_id = vervent_camber_lease_id(sc.contract_no)
  FROM portfolio_snapshots s
 WHERE s.id = sc.snapshot_id AND s.servicer = 'vervent' AND sc.lease_id IS NULL;
