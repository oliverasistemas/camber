-- =============================================================================
-- Camber collections pipeline — schemas
--   vervent_raw   : servicer (Vervent) sFTP reports, staged verbatim as text
--   camber_ops    : Camber-side inputs (pool, overrides, Copart, LTR, codes)
--   camber_credit : adds loan_tape (generated monthly tape) to the existing
--                   lease-tape schema in ../../sql/01_schema.sql
-- Dialect: PostgreSQL 14+. Idempotent: run with psql -f.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS vervent_raw;
CREATE SCHEMA IF NOT EXISTS camber_ops;
CREATE SCHEMA IF NOT EXISTS camber_credit;

-- -----------------------------------------------------------------------------
-- Helpers: Vervent files carry dates as text (mm/dd/yyyy) or ISO when they
-- pass through Excel; numerics occasionally carry commas. Parse defensively.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION camber_ops.parse_date(t text) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL OR btrim(t) = '' THEN NULL
    WHEN btrim(t) ~ '^\d{4}-\d{2}-\d{2}' THEN substring(btrim(t), 1, 10)::date
    WHEN btrim(t) ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN make_date(
      split_part(btrim(t), '/', 3)::int,
      split_part(btrim(t), '/', 1)::int,
      split_part(btrim(t), '/', 2)::int)
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION camber_ops.parse_num(t text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v ~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$' THEN v::numeric
    ELSE NULL
  END
  FROM (SELECT nullif(regexp_replace(btrim(coalesce(t, '')), '[,$ ]', '', 'g'), '')) s(v)
$$;

-- LeasePak contract numbers get a letter suffix for follow-on contracts (e.g.
-- deficiency balances: '500069007D'); normalize back to the parent lease id.
-- Mirrors the LEASE_ID_NORM formula in Brad's workbook:
--   last char non-numeric -> first char + '0' + middle (dropping last char)
CREATE OR REPLACE FUNCTION camber_ops.norm_lease_id(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN s = '' THEN NULL
    WHEN right(s, 1) !~ '[0-9]' THEN left(s, 1) || '0' || substr(s, 2, length(s) - 2)
    ELSE s
  END
  FROM (SELECT btrim(coalesce(t, ''))) x(s)
$$;

-- -----------------------------------------------------------------------------
-- Ingest registry — one row per loaded file
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vervent_raw.file_registry (
  file_id     serial       PRIMARY KEY,
  report_type text         NOT NULL,
  asof_date   date         NOT NULL,   -- reporting date the file covers
  filename    text         NOT NULL,
  sha256      char(64)     NOT NULL,
  row_count   integer      NOT NULL,
  loaded_at   timestamptz  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Staged Vervent reports (text verbatim; typed parsing happens in the tape
-- build). lease_id_norm is computed at load when the file doesn't carry it.
-- load_seq preserves file row order (lookup semantics = first match).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vervent_raw.trans_history (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  lease_id_norm text, report_key text, contract_number text, name text,
  is_payoff text, is_non_cash text, is_past_due text, is_cash_report_transaction text,
  trans text, description text, bankcd text, debit_vector text, credit_vector text,
  checkno text, posted_date text, invoice_due_date text, transaction_amount text,
  payment text, prepayment text, payoff text, inventory_sale text, paydown text,
  property_tax text, sales_tax text, late_charge text, collection_fee text,
  assumption_fee text, legal_fee text, pmt_extension text, lse_extension text,
  itc_fees text, fhut text, idr text, lease_rewrite text, other_fees text,
  security_deposit text, suspense text, rcr1 text, rcr2 text, rcr3 text,
  payment_amount text, operinits text, help_posted_date text
);
CREATE INDEX IF NOT EXISTS trans_history_lease_idx
  ON vervent_raw.trans_history (asof_date, lease_id_norm);

CREATE TABLE IF NOT EXISTS vervent_raw.asset_summary (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  lease_id_norm text, state text, county text, lease text, asset_no text,
  port text, comp text, reg text, off text, name text, address text, city text,
  zip text, term text, ls_type text, description text, in_svc_date text,
  acquis_date text, sold_date text, orig_cost text, status text, status_date text,
  dealer text, dealer_name text, contr_status text, list_price_msrp text,
  tax_type text, tax_code text, class text, orig_rcvbl text, residual text,
  guaranteed text, lessee_no text, inventory text, orig_contr_no text,
  new_used text, rental_income text, resi_income text, interest_income text,
  sale_proceeds text, asset_as_sched text, account_payable text,
  serial_number text, title_number text, title_state text, year text, make text,
  model text, trim text, fuel_type text, curr_addr_validated_y_n text,
  curr_addr_validated_date text, orig_asset_no text, orig_lease_no text,
  orig_residual text, curr_repo_status text, curr_repo_status_date text,
  on_hand_date text, allow_ppt_assmt text, report_ppt text, upfront_stax_y_n text,
  repo_code text, repo_code_date text, help_sold_date text, help_status_date text
);
CREATE INDEX IF NOT EXISTS asset_summary_lease_idx
  ON vervent_raw.asset_summary (asof_date, lease_id_norm);

CREATE TABLE IF NOT EXISTS vervent_raw.contract_summary (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  lease_id_norm text, port text, comp text, reg text, off text, lease_no text,
  ls_status text, ls_status_date text, account_status text, is_account_open text,
  book_date text, last_update text, lease_date text, commence_date text,
  maturity_date text, last_paid_date text, next_due_date text,
  accrued_to_date text, accrual_method text, business_personal text, ls_type text,
  stmt_code text, use_tax_code text, late_code text, open_closed text,
  late_chg_y_n text, lessor_yield text, net_yield text, lessee_name text,
  lessee_state text, orig_unearned text, orig_ue_resid text, tot_residual text,
  unguar_resi text, term text, contract_rcvbl text, outstanding_a_r text,
  net_o_s_a_r text, other_charges text, remaining_receivables text,
  remaining_interest text, past_due_receivables text, lsor_remain_u_e text,
  unearned_residual text, accrued_prin text, resid_income_ytd text,
  resi_income text, lessor_income_ytd text, unearned_income text,
  id1st_asset_desc text, broker_fees text, pap text, pap_eff_date text,
  dealer text, dlr_name text, dal_phone1 text, dal_phone2 text, dal_addr1 text,
  dal_addr2 text, dal_city text, dal_state text, dal_zip text,
  equip_location text, days_del text, curr_delinq text, id_30_del text,
  id_60_del text, id_90_del text, id_91_del text, mark_up text,
  curr_mo_rental text, ls_source text, coll_code text, coll_date text,
  curr_pymt text, direct_debit_y_n text, annual_mileage_allowed text,
  excess_per_mile_chg text, disposition_fee text, orig_cont_no text,
  pmts_coll_upfront text, tot_pmt_coll_upfront text, guar1_credit_score text,
  guar1_bus_ph_type text, guar1_bus_ph_tcpa_y_n text, guar1_home_ph_type text,
  guar1_home_ph_tcpa_y_n text, mod_reason text, mod_date text, as_of_date text,
  est_payoff text, outstanding_lease_balance text, credit_score text,
  column1 text, help_ls_status_date text, cb_offboarded_account_0_1 text
);
CREATE INDEX IF NOT EXISTS contract_summary_lease_idx
  ON vervent_raw.contract_summary (asof_date, lease_id_norm);

CREATE TABLE IF NOT EXISTS vervent_raw.eot_charges (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  claim_lpc_accnt text, customer_name text, address text,
  city_state_zip_code text, description text, vin text,
  mileage_fee_calculation text, excess_wear_and_tear_includes_tire text,
  disposition_fee_350_00 text, total_fees_due text
);

-- -----------------------------------------------------------------------------
-- Camber-side inputs
-- -----------------------------------------------------------------------------

-- Static pool attributes (from the pool cut-off tape; one row per lease)
CREATE TABLE IF NOT EXISTS camber_ops.pool (
  lease_id                 bigint        PRIMARY KEY,
  vin                      varchar(20)   NOT NULL,
  model_year               smallint,
  make                     text,
  yr_make_model            text,
  fuel_type                text,
  new_used                 char(1),
  open_closed_lease        char(1),
  business_personal        char(1),
  lease_extension          boolean,
  lessee_fico              smallint,
  lessee_state             char(2),
  lease_term_months        smallint,
  lease_date               date,
  maturity_date            date,
  orig_cost                numeric(12,2),
  contract_residual_value  numeric(12,2),
  pmt_reg                  numeric(12,2),
  pmt_freq                 char(1),
  alg_model_used           text,
  lease_dcf                numeric(12,9),
  par_value_lessor_yield_dcf_20251031 numeric(18,6),
  par_value_9pct_payments_20251031    numeric(18,6),
  par_value_9pct_residual_20251031    numeric(18,6),
  par_value_9pct_dcf_20251031         numeric(18,6),
  pool_name                text NOT NULL DEFAULT '2026-1'
);

-- Manual override fields (quality control / servicer-data correction).
-- One row per lease, month, field. 'sale_proceeds' overrides typically come
-- from Copart/Manheim settlement data when it disagrees with Vervent.
CREATE TABLE IF NOT EXISTS camber_ops.overrides (
  lease_id   bigint NOT NULL,
  asof_date  date   NOT NULL,
  field      text   NOT NULL,
  value      text   NOT NULL,
  source     text   NOT NULL DEFAULT 'manual',
  reason     text,
  loaded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lease_id, asof_date, field)
);
ALTER TABLE camber_ops.overrides DROP CONSTRAINT IF EXISTS overrides_field_check;
ALTER TABLE camber_ops.overrides ADD CONSTRAINT overrides_field_check CHECK (field IN
  ('sold_month', 'sale_proceeds', 'past_due_receivables', 'days_delinquent',
   'eol_ar_exclusion', 'under_review',
   -- pins a lease's status regardless of servicer data (also suppresses
   -- servicer sold-date detection when pinned to a non-sold status)
   'lease_status',
   -- replaces the computed period cash collections / payment-excl-taxes
   'period_cash_flow', 'period_payment_excl_taxes'));

-- Camber Lease Term Report (Camber-generated; drives termination fields and
-- end-of-lease receivables). Subset of the report's 104 columns.
CREATE TABLE IF NOT EXISTS camber_ops.lease_term_report (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  idx text, vin text, workflow_stage text, termination_type text,
  termination_date text, prepayment_flag_0_1 text,
  termination_date_vs_maturity_date_category text,
  seasoning_at_termination_mo text, condition_report_y_n text,
  vehicle_return_date text, excess_mileage_charge_final text,
  excess_wear_charge_final text, total_excess_mileage_wear_charge text,
  vervent_contract_disposition_fee text, total_end_of_lease_fees text,
  disposition_channel text, gross_sale_proceeds text, net_sales_proceeds_final text,
  accounts_receivable_total text, invoice_sent text, invoice_sent_date text
);
CREATE INDEX IF NOT EXISTS lease_term_report_idx
  ON camber_ops.lease_term_report (asof_date, idx);

CREATE TABLE IF NOT EXISTS camber_ops.cb_offboarded_accounts (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  idx text, portfolio text, camber_main_tranche text,
  camber_post_maturity_tranche text, neither text
);

-- Copart weekly "Camber Sales & Inventory Report" — Sales tab
CREATE TABLE IF NOT EXISTS camber_ops.copart_sales (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,   -- report date
  vin text, lot_nbr text, year text, make text, model text,
  physical_location text, location_state text, first_auction_date text,
  sale_date text, sales_status text, runs_at_auction text, total_bids text,
  acv text, proquote text, reserve_amount_on_final_auction text,
  gross_sale_price text, total_advance_charges text, total_copart_charges text,
  total_seller_charges text, net_sale_proceeds text
);

-- Copart weekly "Camber Sales & Inventory Report" — Inventory tab
CREATE TABLE IF NOT EXISTS camber_ops.copart_inventory (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  vin text, lot_nbr text, year text, make text, model text,
  order_assignment_date text, order_recieved_date text, inventory_status text,
  physical_location text, location_state text, title_status text,
  reserve_set text, reserve_amount_on_final_auction text, days_in_yard text,
  primary_damage text, secondary_damage text, loss_type text, odometer text,
  auto_grade_score text, nada_acv_value text, proquote text,
  drivability_rating text, date_of_sell text, est_repair_cost text
);

-- Copart portal "Lot Search Results" export (portal access limits columns)
CREATE TABLE IF NOT EXISTS camber_ops.copart_lot_inventory (
  load_seq   bigserial PRIMARY KEY,
  file_id    integer   NOT NULL REFERENCES vervent_raw.file_registry (file_id) ON DELETE CASCADE,
  asof_date  date      NOT NULL,
  lot text, claim text, description text, vin text, status text,
  assignment_type text, insured text, location_state text, auction_date text,
  adjuster text, assignment_date text, days_in_yard text, policy text,
  primary_damage text, sale_name text, sale_platform text, secondary_damage text,
  seller text, seller_reference text, seller_company text, unit text,
  pickup_images text, owner_name text, specialty_family_name text,
  specialty_category text, specialty_description text, sub_status text
);

-- LeasePak asset status code -> Camber lease status (0 active / 1 inventory /
-- 2 sold), per the Vervent data dictionary ("Asset_Codes" in Brad's workbook)
CREATE TABLE IF NOT EXISTS camber_ops.asset_status_codes (
  code         text     PRIMARY KEY,
  camber_flag  smallint NOT NULL
);
INSERT INTO camber_ops.asset_status_codes (code, camber_flag) VALUES
  ('NLSE', 0), ('ULSE', 0),
  ('NRIN', 1), ('URIN', 1), ('NRIV', 1), ('URIV', 1), ('NRPR', 1), ('URPR', 1),
  ('NRPS', 1), ('URPS', 1), ('NRSL', 1), ('URSL', 1),
  ('NSLD', 2), ('USLD', 2)
ON CONFLICT (code) DO NOTHING;

-- Expected per-lease values from Brad's workbook, for tie-out verification
CREATE TABLE IF NOT EXISTS camber_ops.expected_tape (
  lease_id text, asof_date date, camber_lease_status text,
  vervent_lease_status text, vervent_asset_status text, termination_type text,
  sold_month text, vervent_net_sale_proceeds text, net_sales_proceeds text,
  period_total_cash_flow text, period_property_tax text, period_sales_tax text,
  period_payment_excl_prop_sales_tax text, past_due_receivables text,
  eol_ar_final text, total_ar_final text, days_delinquent text,
  n_pmts_remaining text, pv_ly_payments text, pv_ly_residual text,
  pv_ly_total text, pv9_payments text, pv9_residual text,
  pv9_total_excl_ppt text, ppt_proration text, pv9_total text,
  eligible_flag text, pv9_eligible text, cum_cash_flow text,
  cum_payment_final text, cb_offboarded text
);

-- -----------------------------------------------------------------------------
-- Output: the generated loan tape — one row per lease per as-of month.
-- Columns mirror Brad's monthly working file (vervent_* = servicer-reported,
-- *_override = manual QC, unprefixed = final/derived values).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS camber_credit.loan_tape (
  lease_id                     bigint   NOT NULL,
  asof_date                    date     NOT NULL,
  under_review                 boolean  NOT NULL DEFAULT false,
  camber_lease_status          smallint,          -- 0 active / 1 in inventory / 2 sold
  vervent_lease_status         text,
  vervent_asset_status         text,
  termination_type             text,              -- 'MID' = lease missing from Lease Term Report
  prepayment_flag              boolean,
  termination_timing_category  text,
  vervent_sold_date            date,
  sold_month_override          date,
  sold_month                   char(7),           -- 'YYYY-MM'
  vervent_net_sale_proceeds    numeric(14,2),
  sale_proceeds_override       numeric(14,2),
  net_sales_proceeds           numeric(14,2),
  period_total_cash_flow       numeric(14,2),
  period_property_tax          numeric(14,2),
  period_sales_tax             numeric(14,2),
  period_payment_excl_sales_tax      numeric(14,2),
  period_payment_excl_prop_sales_tax numeric(14,2),
  period_eol_collections       numeric(14,2),
  estimated_period_invoices    numeric(12,2),
  vervent_past_due             numeric(14,2),
  past_due_override            numeric(14,2),
  past_due_receivables         numeric(14,2),
  condition_report_available   text,
  ltr_found                    boolean,
  ltr_eol_ar                   numeric(14,2),
  vervent_eol_mileage          numeric(14,2),
  vervent_eol_wear             numeric(14,2),
  vervent_eol_disposition      numeric(14,2),
  vervent_eol_total            numeric(14,2),
  est_eol_mileage              numeric(14,2),
  est_eol_wear                 numeric(14,2),
  eol_ar_final                 numeric(14,2),
  eol_ar_exclusion             boolean NOT NULL DEFAULT false,
  total_ar_final               numeric(14,2),
  vervent_days_delinquent      integer,
  days_delinquent_override     integer,
  days_delinquent              integer,
  last_payment_date            date,
  n_pmts_remaining             smallint,
  pv_ly_payments               numeric(18,6),     -- lessor-yield DCF
  pv_ly_residual               numeric(18,6),
  pv_ly_total                  numeric(18,6),
  pv9_payments                 numeric(18,6),     -- 9% DCF
  pv9_residual                 numeric(18,6),
  pv9_total_excl_ppt           numeric(18,6),
  ppt_proration                numeric(18,6),
  pv9_total                    numeric(18,6),
  eligible_flag                boolean,
  pv9_eligible                 numeric(18,6),
  cum_cash_flow                numeric(14,2),     -- pool start through asof
  cum_property_tax             numeric(14,2),
  cum_sales_tax                numeric(14,2),
  cum_payment_calc             numeric(14,2),
  proceeds_exceed_collections  boolean,
  cum_payment_final            numeric(14,2),
  cb_offboarded                boolean,
  par_mom_change               numeric(18,6),
  ar_mom_change                numeric(14,2),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lease_id, asof_date)
);
