-- vervent_assets: DDL generated from AssetSummary daily extract headers (82 source columns).
-- Source: /Users/ao/pipeline/vervent/YYYYMMDD_AssetSummary_Daily_P50.csv (pipe-delimited, header row).

CREATE TABLE IF NOT EXISTS vervent_assets (
    state                     text,
    county                    text,
    lease                     text,
    asset_no                  integer NOT NULL,
    port                      integer,
    comp                      integer,
    reg                       integer,
    off                       text,
    name                      text,
    address                   text,
    city                      text,
    zip                       text,
    term                      integer,
    ls_type                   text,
    description               text,
    in_svc_date               date,
    acquis_date               date,
    sold_date                 date,
    orig_cost                 numeric(18,2),
    status                    text,
    status_date               date,
    dealer                    integer,
    dealer_name               text,
    contr_status              text,
    udf_13                    numeric(18,2),
    tax_type                  text,
    tax_code                  text,
    class                     text,
    orig_rcvbl                numeric(18,2),
    residual                  numeric(18,2),
    guaranteed                numeric(18,2),
    lessee_no                 integer,
    inventory                 numeric(18,2),
    orig_contr_no             text,
    new_used                  text,
    rental_income             numeric(24,12),
    resi_income               numeric(24,12),
    interest_income           numeric(24,12),
    sale_proceeds             numeric(18,2),
    asset_as_sched            numeric(18,6),
    account_payable           numeric(18,2),
    serial_number             text,
    title_state               text,
    title_number              text,
    inv_comment               text,
    eheld_orig_contr          text,
    eheld_cust_name           text,
    eheld_lessee              text,
    eheld_return              text,
    model                     text,
    "trim"                    text,
    fuel_type                 text,
    agreed_upon_val_cap       numeric(18,2),
    collateral_code           text,
    mfg_vend_inv_no           text,
    curr_addr_validated_y_n   text,
    curr_addr_validated_date  date,
    orig_asset_no             integer,
    orig_lease_no             integer,
    orig_residual             numeric(18,2),
    pre_lease_no              text,
    prev_commence             date,
    prev_residual             numeric(18,2),
    prev_asset_no             text,
    curr_repo_status          text,
    curr_repo_status_date     date,
    sec_note                  text,
    allow_ppt_assmt           text,
    report_ppt                text,
    annual_monthly            text,
    upfront_stax_y_n          text,
    appr_value                numeric(18,2),
    appr_date                 date,
    repo_code                 text,
    repo_code_date            date,
    on_hand                   text,
    orig_asset_id             text,
    engine                    numeric(18,2),
    man_inv_amt               numeric(18,2),
    agreed_val_cap            numeric(18,2),
    orig_resid                numeric(18,2),
    investor_status           text,
    source_file               text NOT NULL,
    file_date                 date NOT NULL,
    loaded_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_vervent_assets PRIMARY KEY (asset_no)
);

CREATE INDEX IF NOT EXISTS ix_vervent_assets_lease ON vervent_assets (lease);
CREATE INDEX IF NOT EXISTS ix_vervent_assets_lessee_no ON vervent_assets (lessee_no);

COMMENT ON TABLE vervent_assets IS 'Vervent portfolio 50 assets (vehicles / deficiency balances). Latest snapshot per asset, upserted daily from *_AssetSummary_Daily_P50.csv.';

COMMENT ON COLUMN vervent_assets.state IS '[STATE] Lessee/garaging state (2-letter USPS code) used for tax purposes.';
COMMENT ON COLUMN vervent_assets.county IS '[COUNTY] County of the lessee/garaging address, used for property-tax assessment.';
COMMENT ON COLUMN vervent_assets.lease IS '[LEASE] Contract (lease) number the asset is booked under. Join key to ContractSummary.[LEASE NO]. Numbers ending in "D" are deficiency-balance contracts created after the original contract closed (e.g. 500069007D derives from 5000069007). Blank on 58 orphan deficiency/inventory asset rows.';
COMMENT ON COLUMN vervent_assets.asset_no IS '[ASSET_NO] Asset number. Unique per row; primary key of this file.';
COMMENT ON COLUMN vervent_assets.port IS '[PORT] Portfolio code. Always 50 (the P50 portfolio).';
COMMENT ON COLUMN vervent_assets.comp IS '[COMP] Company code within the portfolio (1 or 2).';
COMMENT ON COLUMN vervent_assets.reg IS '[REG] Region code. Always 1.';
COMMENT ON COLUMN vervent_assets.off IS '[OFF] Office / booking unit. 100 = standard vehicle book, DEF = deficiency balances, CO = other office (74 rows).';
COMMENT ON COLUMN vervent_assets.name IS '[NAME] Lessee / customer name.';
COMMENT ON COLUMN vervent_assets.address IS '[ADDRESS] Lessee street address.';
COMMENT ON COLUMN vervent_assets.city IS '[CITY] Lessee city.';
COMMENT ON COLUMN vervent_assets.zip IS '[ZIP] Lessee ZIP code, right-padded with spaces; 5-digit or ZIP+4 (9 digits, no hyphen). Leading zeros are dropped for some Northeast ZIPs (e.g. 2066) - treat as text.';
COMMENT ON COLUMN vervent_assets.term IS '[TERM] Contract term in months. 1 for deficiency-balance assets.';
COMMENT ON COLUMN vervent_assets.ls_type IS '[LS_TYPE] Lease type. FIN = finance lease, INSL = installment/deficiency loan. Blank where LEASE is blank.';
COMMENT ON COLUMN vervent_assets.description IS '[DESCRIPTION] Asset description, typically "YYYY MAKE MODEL" for vehicles, or "DEFICIENCY BALANCE".';
COMMENT ON COLUMN vervent_assets.in_svc_date IS '[IN_SVC_DATE] Date the asset was placed in service. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.acquis_date IS '[ACQUIS_DATE] Date the asset was acquired by the lessor. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.sold_date IS '[SOLD DATE] Date the asset was sold/disposed. Populated only when STATUS = USLD. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.orig_cost IS '[ORIG_COST] Original cost (capitalized cost) of the asset, USD. 0.01 is a placeholder for deficiency-balance assets.';
COMMENT ON COLUMN vervent_assets.status IS '[STATUS] Asset status code. Observed: USLD = sold (always has SOLD DATE), NLSE = on lease, ULSE = on lease (used/re-leased), URIN = returned to inventory, NRIV = in inventory (not leased).';
COMMENT ON COLUMN vervent_assets.status_date IS '[STATUS_DATE] Date STATUS was last changed. 12/31/2022 appears to be a system-conversion default. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.dealer IS '[DEALER] Originating dealer/vendor number.';
COMMENT ON COLUMN vervent_assets.dealer_name IS '[DEALER_NAME] Originating dealer/vendor name.';
COMMENT ON COLUMN vervent_assets.contr_status IS '[CONTR_STATUS] Status of the associated contract; same code set as ContractSummary.[LS STATUS] (see that file).';
COMMENT ON COLUMN vervent_assets.udf_13 IS '[UDF13] User-defined field 13. Holds a dollar amount (appears to be vehicle invoice/MSRP-type value).';
COMMENT ON COLUMN vervent_assets.tax_type IS '[TAX TYPE] Tax treatment. TLA = tax on lease amount (payment-based), SALE = upfront/sales tax.';
COMMENT ON COLUMN vervent_assets.tax_code IS '[TAX CODE] Tax exemption / jurisdiction code. Observed: ALL, NOEX, NOPF, STCN, STCI, PERM.';
COMMENT ON COLUMN vervent_assets.class IS '[CLASS] Asset class. V = vehicle, EDEF = deficiency balance.';
COMMENT ON COLUMN vervent_assets.orig_rcvbl IS '[ORIG_RCVBL] Original receivable attributable to this asset (total scheduled payments), USD.';
COMMENT ON COLUMN vervent_assets.residual IS '[RESIDUAL] Residual value of the asset at maturity, USD.';
COMMENT ON COLUMN vervent_assets.guaranteed IS '[GUARANTEED] Not populated in this extract. (Intended: guaranteed portion of residual.)';
COMMENT ON COLUMN vervent_assets.lessee_no IS '[LESSEE_NO] Lessee (customer) number. Join key to ContractSummary.[LESSEE NO]; one lessee can have several contracts.';
COMMENT ON COLUMN vervent_assets.inventory IS '[INVENTORY] Inventory (carrying) value of the asset, USD; 0 while on lease.';
COMMENT ON COLUMN vervent_assets.orig_contr_no IS '[ORIG CONTR NO] Y/N flag (13 rows populated). Label suggests original contract number but content is a flag.';
COMMENT ON COLUMN vervent_assets.new_used IS '[NEW USED] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.rental_income IS '[RENTAL_INCOME] Rental income recognized on the asset, USD (12 decimal places).';
COMMENT ON COLUMN vervent_assets.resi_income IS '[RESI_INCOME] Residual income recognized on the asset, USD.';
COMMENT ON COLUMN vervent_assets.interest_income IS '[INTEREST_INCOME] Interest income recognized on the asset, USD.';
COMMENT ON COLUMN vervent_assets.sale_proceeds IS '[SALE PROCEEDS] Proceeds from sale/disposition of the asset, USD.';
COMMENT ON COLUMN vervent_assets.asset_as_sched IS '[ASSET_AS_SCHED] Asset share of the contract schedule (1.0 = asset carries 100% of the schedule, 0 = none).';
COMMENT ON COLUMN vervent_assets.account_payable IS '[ACCOUNT_PAYABLE] Accounts payable amount on the asset (0 or 0.01 placeholder).';
COMMENT ON COLUMN vervent_assets.serial_number IS '[SERIAL NUMBER] Vehicle VIN / serial number. For deficiency-balance assets it holds the original contract number instead.';
COMMENT ON COLUMN vervent_assets.title_state IS '[TITLE STATE] State that issued the vehicle title.';
COMMENT ON COLUMN vervent_assets.title_number IS '[TITLE NUMBER] Vehicle title number. "XXX" used as a placeholder.';
COMMENT ON COLUMN vervent_assets.inv_comment IS '[INV_COMMENT] Inventory comment (free text; 3 rows).';
COMMENT ON COLUMN vervent_assets.eheld_orig_contr IS '[EHELD_ORIG_CONTR] LABEL MISMATCH - contains a dollar amount (mixed formats, e.g. "$31,580.00", "28,650.00"), not a contract number. Treat as text.';
COMMENT ON COLUMN vervent_assets.eheld_cust_name IS '[EHELD_CUST_NAME] LABEL MISMATCH - contains a date (mixed formats MM/DD/YYYY and M/D/YYYY), not a name.';
COMMENT ON COLUMN vervent_assets.eheld_lessee IS '[EHELD_LESSEE] LABEL MISMATCH - contains the vehicle MODEL YEAR (e.g. 2022).';
COMMENT ON COLUMN vervent_assets.eheld_return IS '[EHELD_RETURN] LABEL MISMATCH - contains the vehicle MAKE (e.g. JEEP, KIA).';
COMMENT ON COLUMN vervent_assets.model IS '[Model] Vehicle model (e.g. WRANGLER, TELLURIDE).';
COMMENT ON COLUMN vervent_assets."trim" IS '[TRIM] Vehicle trim level (free text).';
COMMENT ON COLUMN vervent_assets.fuel_type IS '[Fuel Type] Fuel type. Inconsistent case (GAS/Gas, ELECTRIC/Electric, HYBRID/Hybrid, DIESEL); one stray value "62010". Normalize before use.';
COMMENT ON COLUMN vervent_assets.agreed_upon_val_cap IS '[Agreed Upon Val Cap] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.collateral_code IS '[Collateral Code] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.mfg_vend_inv_no IS '[MFG_VEND Inv No] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.curr_addr_validated_y_n IS '[Curr Addr Validated Y N] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.curr_addr_validated_date IS '[Curr Addr Validated Date] Not populated in this extract. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.orig_asset_no IS '[Orig Asset No] Original asset number from the prior/legacy system; usually equals the numeric tail of the lease number (e.g. 69007).';
COMMENT ON COLUMN vervent_assets.orig_lease_no IS '[Orig Lease No] Original lease number from the prior/legacy system; matches Orig Asset No.';
COMMENT ON COLUMN vervent_assets.orig_residual IS '[Orig Residual] Original residual value, USD (10 rows).';
COMMENT ON COLUMN vervent_assets.pre_lease_no IS '[Pre Lease No] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.prev_commence IS '[Prev Commence] Not populated in this extract. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.prev_residual IS '[Prev Residual] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.prev_asset_no IS '[Prev Asset No] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.curr_repo_status IS '[Curr REPO Status] Current repossession/return workflow status. Observed: RTCS (most common), REVI, RESA, REOR, REED, RECA, RECO, REDL, RHLD, CURR, REAU, RTCX, RTC, RABO. Blank = no repo activity.';
COMMENT ON COLUMN vervent_assets.curr_repo_status_date IS '[Curr REPO Status Date] Date of Curr REPO Status in YYMMDD format (e.g. 261012 = 2026-10-12). Source format YYMMDD.';
COMMENT ON COLUMN vervent_assets.sec_note IS '[SEC_NOTE] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.allow_ppt_assmt IS '[ALLOW PPT ASSMT] Allow personal property tax assessment (Y). Always Y.';
COMMENT ON COLUMN vervent_assets.report_ppt IS '[REPORT PPT] Report for personal property tax (Y/N).';
COMMENT ON COLUMN vervent_assets.annual_monthly IS '[ANNUAL-MONTHLY] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.upfront_stax_y_n IS '[UPFRONT STAX(Y N)] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.appr_value IS '[Appr Value] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.appr_date IS '[Appr Date] Not populated in this extract. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.repo_code IS '[REPO Code] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.repo_code_date IS '[REPO Code Date] Not populated in this extract. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_assets.on_hand IS '[ON_HAND] On-hand / inventory value, mixed text formats (e.g. "$31,000.00", "22000.00"). 24 rows.';
COMMENT ON COLUMN vervent_assets.orig_asset_id IS '[ORIG_ASSET_ID] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.engine IS '[ENGINE] LABEL MISMATCH - holds a dollar amount (33 rows), not an engine description.';
COMMENT ON COLUMN vervent_assets.man_inv_amt IS '[MAN_INV_AMT] Manufacturer invoice amount, USD (34 rows).';
COMMENT ON COLUMN vervent_assets.agreed_val_cap IS '[AGREED_VAL_CAP] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.orig_resid IS '[ORIG_RESID] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.investor_status IS '[INVESTOR STATUS] Not populated in this extract.';
COMMENT ON COLUMN vervent_assets.source_file IS 'Name of the CSV file the row was loaded from.';
COMMENT ON COLUMN vervent_assets.file_date IS 'Business date from the file-name prefix (YYYYMMDD_...). On upsert tables, guards against overwriting newer data with an older file.';
COMMENT ON COLUMN vervent_assets.loaded_at IS 'Timestamp the row was inserted or last updated.';
