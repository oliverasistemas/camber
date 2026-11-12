-- copart_sales: DDL for the "Sales Tab" sheet of the weekly Copart seller report (20 source columns).
-- Source: copart/CamberSalesInventorySalesReport_YYYY-MM-DD.xlsx (header row 1, one row per sold Copart lot).

CREATE TABLE IF NOT EXISTS copart_sales (
    vin                              text NOT NULL,
    lot_nbr                          bigint NOT NULL,
    year                             smallint,
    make                             text,
    model                            text,
    physical_location                text,
    location_state                   text,
    first_auction_date               date,
    sale_date                        date,
    sales_status                     text,
    runs_at_auction                  integer,
    total_bids                       integer,
    acv                              numeric(18,2),
    proquote                         numeric(18,2),
    reserve_amount_on_final_auction  numeric(18,2),
    gross_sale_price                 numeric(18,2),
    total_advance_charges            numeric(18,2),
    total_copart_charges             numeric(18,2),
    total_seller_charges             numeric(18,2),
    net_sale_proceeds                numeric(18,2),
    source_file                      text NOT NULL,
    file_date                        date NOT NULL,
    loaded_at                        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_copart_sales PRIMARY KEY (lot_nbr)
);

CREATE INDEX IF NOT EXISTS ix_copart_sales_vin ON copart_sales (vin);
CREATE INDEX IF NOT EXISTS ix_copart_sales_sale_date ON copart_sales (sale_date);

COMMENT ON TABLE copart_sales IS 'Camber vehicles sold at Copart auction, with sale price and charges. Latest snapshot per lot, upserted from the weekly CamberSalesInventorySalesReport_*.xlsx (Sales Tab). Every lot is also in copart_inventory (join on lot_nbr; no FK, matching the vervent_* tables).';

COMMENT ON COLUMN copart_sales.vin IS '[vin] Vehicle VIN (17 chars). Join key to vervent_assets.serial_number.';
COMMENT ON COLUMN copart_sales.lot_nbr IS '[lot_nbr] Copart lot number. Unique per row; primary key. Join key to copart_inventory.lot_nbr.';
COMMENT ON COLUMN copart_sales.year IS '[year] Vehicle model year.';
COMMENT ON COLUMN copart_sales.make IS '[make] Copart make abbreviation (JEP = Jeep, CHRY = Chrysler, DODG = Dodge, LINC = Lincoln, ...).';
COMMENT ON COLUMN copart_sales.model IS '[model] Vehicle model, truncated by Copart to 10 characters.';
COMMENT ON COLUMN copart_sales.physical_location IS '[physical_location] Copart yard as "<yard no> - <state> - <name>", e.g. "369 - KS - KANSAS CITY".';
COMMENT ON COLUMN copart_sales.location_state IS '[location_state] State of the yard (2-letter USPS code).';
COMMENT ON COLUMN copart_sales.first_auction_date IS '[first_auction_date] Date the lot was first offered at auction.';
COMMENT ON COLUMN copart_sales.sale_date IS '[sale_date] Date the lot sold. Equals copart_inventory.date_of_sell.';
COMMENT ON COLUMN copart_sales.sales_status IS '[sales_status] Settlement status. Observed: Closed (paid out), WAITING FOR SELLER PAYMENT.';
COMMENT ON COLUMN copart_sales.runs_at_auction IS '[runs_at_auction] Number of auctions the lot ran in before it sold.';
COMMENT ON COLUMN copart_sales.total_bids IS '[total_bids] Total bids received on the lot.';
COMMENT ON COLUMN copart_sales.acv IS '[acv] Actual cash value of the vehicle, USD (same figure as copart_inventory.nada_acv_value).';
COMMENT ON COLUMN copart_sales.proquote IS '[proquote] Copart ProQuote estimated sale price, USD.';
COMMENT ON COLUMN copart_sales.reserve_amount_on_final_auction IS '[reserve_amount_on_final_auction] Reserve price on the auction the lot sold in, USD.';
COMMENT ON COLUMN copart_sales.gross_sale_price IS '[gross_sale_price] Winning bid, USD.';
COMMENT ON COLUMN copart_sales.total_advance_charges IS '[total_advance_charges] Advance charges Copart paid on Camber''s behalf (towing, storage), USD. Always 0 in the samples.';
COMMENT ON COLUMN copart_sales.total_copart_charges IS '[total_copart_charges] Copart seller fees, USD (typically 100, 190 or 195).';
COMMENT ON COLUMN copart_sales.total_seller_charges IS '[total_seller_charges] Total charges to the seller, USD = total_advance_charges + total_copart_charges.';
COMMENT ON COLUMN copart_sales.net_sale_proceeds IS '[net_sale_proceeds] Amount remitted to Camber, USD = gross_sale_price - total_seller_charges. Compare with vervent_assets.sale_proceeds.';
COMMENT ON COLUMN copart_sales.source_file IS 'Name of the xlsx file the row was loaded from.';
COMMENT ON COLUMN copart_sales.file_date IS 'Report date from the file name (..._YYYY-MM-DD.xlsx). Guards against overwriting newer data with an older file.';
COMMENT ON COLUMN copart_sales.loaded_at IS 'Timestamp the row was inserted or last updated.';
