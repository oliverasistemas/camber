-- copart_inventory: DDL for the "Inventory Tab" sheet of the weekly Copart seller report (24 source columns).
-- Source: copart/CamberSalesInventorySalesReport_YYYY-MM-DD.xlsx (header row 1, one row per Copart lot).

CREATE TABLE IF NOT EXISTS copart_inventory (
    vin                              text NOT NULL,
    lot_nbr                          bigint NOT NULL,
    year                             smallint,
    make                             text,
    model                            text,
    order_assignment_date            date,
    order_received_date              date,
    inventory_status                 text,
    physical_location                text,
    location_state                   text,
    title_status                     text,
    reserve_set                      boolean,
    reserve_amount_on_final_auction  numeric(18,2),
    days_in_yard                     integer,
    primary_damage                   text,
    secondary_damage                 text,
    loss_type                        text,
    odometer                         integer,
    auto_grade_score                 numeric(3,1),
    nada_acv_value                   numeric(18,2),
    proquote                         numeric(18,2),
    drivability_rating               text,
    date_of_sell                     date,
    est_repair_cost                  numeric(18,2),
    source_file                      text NOT NULL,
    file_date                        date NOT NULL,
    loaded_at                        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_copart_inventory PRIMARY KEY (lot_nbr)
);

CREATE INDEX IF NOT EXISTS ix_copart_inventory_vin ON copart_inventory (vin);
CREATE INDEX IF NOT EXISTS ix_copart_inventory_inventory_status ON copart_inventory (inventory_status);

COMMENT ON TABLE copart_inventory IS 'Camber vehicles assigned to Copart for remarketing. Latest snapshot per lot, upserted from the weekly CamberSalesInventorySalesReport_*.xlsx (Inventory Tab).';

COMMENT ON COLUMN copart_inventory.vin IS '[vin] Vehicle VIN (17 chars). Join key to vervent_assets.serial_number. Not unique: a vehicle re-assigned to Copart gets a new lot (20 VINs have 2 lots in the 2026-10-05 report).';
COMMENT ON COLUMN copart_inventory.lot_nbr IS '[lot_nbr] Copart lot number. Unique per row; primary key.';
COMMENT ON COLUMN copart_inventory.year IS '[year] Vehicle model year.';
COMMENT ON COLUMN copart_inventory.make IS '[make] Copart make abbreviation (JEP = Jeep, CHRY = Chrysler, DODG = Dodge, LAND = Land Rover, GENS = Genesis, ...).';
COMMENT ON COLUMN copart_inventory.model IS '[model] Vehicle model, truncated by Copart to 10 characters (e.g. "GRAND CHER", "WRANGLER U").';
COMMENT ON COLUMN copart_inventory.order_assignment_date IS '[order_assignment_date] Date Camber assigned the vehicle to Copart.';
COMMENT ON COLUMN copart_inventory.order_received_date IS '[order_recieved_date] Date Copart received the vehicle at the yard. The source header is misspelled ("recieved").';
COMMENT ON COLUMN copart_inventory.inventory_status IS '[inventory_status] Lot status. Observed: READY FOR AUCTION, Closed (sold), Closed - OWNER RETAINED, WAITING FOR ORIGINAL TITLE, WAITING FOR TRANSFERABLE TITLE, WAITING FOR SELLER PAYMENT, SELLER HOLD PROGRAM, OWNER RETAIN-SELLER OWES US. Mixed case as sent.';
COMMENT ON COLUMN copart_inventory.physical_location IS '[physical_location] Copart yard as "<yard no> - <state> - <name>", e.g. "20 - MO - ST. LOUIS".';
COMMENT ON COLUMN copart_inventory.location_state IS '[location_state] State of the yard (2-letter USPS code).';
COMMENT ON COLUMN copart_inventory.title_status IS '[title_status] Title processing status. Observed: Completed, Awaiting Original Document, Awaiting Title Processing.';
COMMENT ON COLUMN copart_inventory.reserve_set IS '[reserve_set] Whether a reserve price is set on the lot (source Y/N).';
COMMENT ON COLUMN copart_inventory.reserve_amount_on_final_auction IS '[reserve_amount_on_final_auction] Reserve price on the final auction, USD. 0 when no reserve is set.';
COMMENT ON COLUMN copart_inventory.days_in_yard IS '[days_in_yard] Days the vehicle has been at the Copart yard.';
COMMENT ON COLUMN copart_inventory.primary_damage IS '[primary_damage] Primary damage code (NORMAL WEAR, MINOR DENT/SCRATCHES, FRONT END, HAIL, SIDE, REAR END, MECHANICAL).';
COMMENT ON COLUMN copart_inventory.secondary_damage IS '[secondary_damage] Secondary damage code, same code set as primary_damage. Mostly blank.';
COMMENT ON COLUMN copart_inventory.loss_type IS '[loss_type] Reason the vehicle is being sold: FLEET/LEASE (lease return), VOLUNTARY REPO, REPOSSESSION.';
COMMENT ON COLUMN copart_inventory.odometer IS '[odometer] Odometer reading in miles at check-in. 0 = not recorded.';
COMMENT ON COLUMN copart_inventory.auto_grade_score IS '[auto_grade_score] Copart condition grade, 0.0-5.0. Blank when not graded.';
COMMENT ON COLUMN copart_inventory.nada_acv_value IS '[NADA_ACV_Value] NADA actual cash value of the vehicle, USD.';
COMMENT ON COLUMN copart_inventory.proquote IS '[proquote] Copart ProQuote estimated sale price, USD.';
COMMENT ON COLUMN copart_inventory.drivability_rating IS '[drivability_rating] Run condition at check-in: DRIVES, STARTS, NO.';
COMMENT ON COLUMN copart_inventory.date_of_sell IS '[date_of_sell] Auction sale date. Set only for sold lots (Closed, WAITING FOR SELLER PAYMENT); the Sales Tab has the sale amounts.';
COMMENT ON COLUMN copart_inventory.est_repair_cost IS '[est_repair_cost] Estimated repair cost, USD. Always 0 in the samples.';
COMMENT ON COLUMN copart_inventory.source_file IS 'Name of the xlsx file the row was loaded from.';
COMMENT ON COLUMN copart_inventory.file_date IS 'Report date from the file name (..._YYYY-MM-DD.xlsx). Guards against overwriting newer data with an older file.';
COMMENT ON COLUMN copart_inventory.loaded_at IS 'Timestamp the row was inserted or last updated.';
