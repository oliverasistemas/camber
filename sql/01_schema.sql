-- =============================================================================
-- Camber Credit 2026-1 — Lease Tape (August 2026 cutoff)
-- SQL entities derived from:
--   "Camber Credit 2026-1 - Lease Tape August 2026 (Final - For Distribution).xlsx"
-- Dialect: PostgreSQL (14+)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS camber_credit;
SET search_path TO camber_credit;

-- -----------------------------------------------------------------------------
-- Enumerated domains
-- -----------------------------------------------------------------------------
CREATE TYPE fuel_type AS ENUM ('GASOLINE', 'HYBRID', 'ELECTRIC');

CREATE TYPE lease_termination_type AS ENUM (
  'Early Payoff',
  'Purchase Option Exercised',
  'Repossession / Default',
  'Voluntary Return at Maturity'
);

-- Timing of actual termination relative to scheduled maturity
CREATE TYPE termination_timing_category AS ENUM (
  '< 3 Months',
  '3-6 Months',
  '6 - 12 Months',
  '1 Year+'
);

-- -----------------------------------------------------------------------------
-- vehicles — one row per leased vehicle (tape columns B–E)
-- -----------------------------------------------------------------------------
CREATE TABLE vehicles (
  vin          varchar(20) PRIMARY KEY,   -- nominally 17 chars; tape contains 14–18 char values, stored verbatim
  model_year   smallint    NOT NULL,
  description  varchar(64) NOT NULL,      -- tape yr_make_model, verbatim: "<year> <make> <model>"
  fuel_type    fuel_type   NOT NULL
);

-- -----------------------------------------------------------------------------
-- lease_status_types — Camber lease status codes (tape column S)
-- -----------------------------------------------------------------------------
CREATE TABLE lease_status_types (
  status_code  smallint    PRIMARY KEY,
  name         varchar(32) NOT NULL
);

-- -----------------------------------------------------------------------------
-- leases — contract-level, inception-time attributes (tape columns A, F–Q)
-- One lease per vehicle in this pool (vin is UNIQUE).
-- -----------------------------------------------------------------------------
CREATE TABLE leases (
  lease_id                 bigint        PRIMARY KEY,  -- tape idx: internal lease/contract identifier
  vin                      varchar(20)   NOT NULL UNIQUE REFERENCES vehicles (vin),
  new_used                 char(1)       NOT NULL CHECK (new_used IN ('N', 'U')),          -- vehicle new/used at inception
  open_closed              char(1)       NOT NULL CHECK (open_closed IN ('O', 'C')),       -- open- vs closed-ended lease
  obligor_type             char(1)       NOT NULL CHECK (obligor_type IN ('B', 'P')),      -- business/commercial vs personal/consumer
  is_extended              boolean       NOT NULL,     -- lease was extended
  lease_term_months        smallint      NOT NULL,     -- contractual term incl. extensions
  lease_date               date          NOT NULL,     -- contract/start date
  maturity_date            date          NOT NULL,     -- scheduled maturity
  orig_cost                numeric(12,2) NOT NULL,     -- vehicle cost at inception
  contract_residual_value  numeric(12,2) NOT NULL,     -- contractual residual at maturity
  payment_regular          numeric(12,2) NOT NULL,     -- regular monthly payment
  alg_model_used           varchar(16)   NOT NULL,     -- ALG residual curve used (e.g. 'ALG+10%')
  lease_dcf                numeric(12,9) NOT NULL,     -- contracted discount rate / implied interest rate
  CONSTRAINT ck_leases_dates CHECK (maturity_date > lease_date)
);

-- -----------------------------------------------------------------------------
-- lease_snapshots — point-in-time servicing status (tape columns S–Z, AC;
-- the August 2026 tape carries one snapshot, as of 2026-08-31)
-- -----------------------------------------------------------------------------
CREATE TABLE lease_snapshots (
  lease_id                     bigint        NOT NULL REFERENCES leases (lease_id),
  asof_date                    date          NOT NULL,
  status_code                  smallint      NOT NULL REFERENCES lease_status_types (status_code),  -- 0=Active, 1=In inventory, 2=Sold
  termination_type             lease_termination_type      NULL,  -- NULL for active leases
  termination_timing_category  termination_timing_category NULL,  -- NULL for active leases
  sold_month                   char(7)       NULL,                -- 'YYYY-MM'; NULL if vehicle not yet sold
  net_sales_proceeds           numeric(12,2) NULL,                -- NULL if vehicle not yet sold
  period_payment_collected     numeric(12,2) NOT NULL,            -- payments collected in the snapshot month, excl. property & sales tax
  days_delinquent              smallint      NOT NULL,
  payments_remaining           smallint      NOT NULL,            -- remaining scheduled payments
  is_eligible_collateral       boolean       NOT NULL,
  PRIMARY KEY (lease_id, asof_date)
);

-- -----------------------------------------------------------------------------
-- lease_valuations — discounted-cash-flow par values per as-of date
-- (tape column R as of 2025-10-31; columns AA, AB, AD as of 2026-08-31;
-- all at a 9% discount rate)
-- -----------------------------------------------------------------------------
CREATE TABLE lease_valuations (
  lease_id                bigint        NOT NULL REFERENCES leases (lease_id),
  asof_date               date          NOT NULL,
  discount_rate           numeric(6,4)  NOT NULL,   -- 0.0900 for this tape
  pv_total                numeric(18,6) NOT NULL,   -- PV of remaining cash flow (monthly + residual)
  pv_contract_residual    numeric(18,6) NULL,       -- PV of the contract residual payment alone (8/31/26 only)
  pv_eligible_collateral  numeric(18,6) NULL,       -- pv_total where lease flagged eligible, else 0 (8/31/26 only)
  PRIMARY KEY (lease_id, asof_date)
);

-- -----------------------------------------------------------------------------
-- v_lease_tape — reconstructs the original distribution-tape layout
-- (August 2026 snapshot joined to inception attributes and both valuations)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_lease_tape AS
SELECT
  l.lease_id                      AS idx,
  v.vin,
  v.model_year                    AS "year",
  v.description                   AS yr_make_model,
  v.fuel_type,
  l.new_used,
  l.open_closed                   AS open_closed_lease,
  l.obligor_type                  AS business_personal,
  l.is_extended                   AS lease_extension,
  l.lease_term_months             AS lease_term,
  l.lease_date,
  l.maturity_date,
  l.orig_cost,
  l.contract_residual_value,
  l.payment_regular               AS pmt_reg,
  l.alg_model_used,
  l.lease_dcf,
  pv0.pv_total                    AS par_value_9pct_dcf_20251031,
  s.status_code                   AS camber_lease_status,
  s.termination_type,
  s.termination_timing_category,
  s.sold_month,
  s.net_sales_proceeds,
  s.period_payment_collected      AS august_payment_excl_tax,
  s.days_delinquent,
  s.payments_remaining,
  pv1.pv_contract_residual        AS par_value_9pct_dcf_contractresidual_20260831,
  pv1.pv_total                    AS par_value_9pct_dcf_20260831,
  s.is_eligible_collateral,
  pv1.pv_eligible_collateral      AS par_value_9pct_dcf_eligiblecollateral_20260831
FROM leases l
JOIN vehicles v          ON v.vin = l.vin
LEFT JOIN lease_snapshots  s   ON s.lease_id  = l.lease_id AND s.asof_date   = DATE '2026-08-31'
LEFT JOIN lease_valuations pv0 ON pv0.lease_id = l.lease_id AND pv0.asof_date = DATE '2025-10-31'
LEFT JOIN lease_valuations pv1 ON pv1.lease_id = l.lease_id AND pv1.asof_date = DATE '2026-08-31';
