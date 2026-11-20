-- portfolio_snapshots / portfolio_snapshot_contracts: frozen copies of the portfolio at a point in
-- time. A snapshot is a header row with the portfolio totals as they were, plus one row per
-- contract. Nothing ever updates a snapshot's rows afterwards, so its figures can be presented
-- (and exported) long after the servicer's tables have moved on.
--
-- The tables are servicer-neutral: the columns are named for what they mean, not for the servicer's
-- file headers, and each contract row keeps the servicer's whole row as it was in servicer_row.
-- The mapping from a servicer's columns is in be/pipeline/portfolio (Vervent); a new servicer adds
-- a mapping there and these tables, and everything that reads them, stay as they are.
--
-- Two kinds:
--   daily   taken by the loader for every ContractSummary file, as of the file's date. One per
--           servicer per day: re-loading a file rebuilds that day's snapshot under the same id.
--           The dashboard's by-day charts are these.
--   manual  taken on demand from the dashboard (POST /api/snapshots), a named copy of the
--           contracts as currently loaded.
--
-- The totals on the header are computed from the snapshot's own contract rows when it is taken:
--   active_contracts         contracts with is_open
--   outstanding_receivables  sum of outstanding_receivables over open contracts
--   past_due                 sum of past_due over open contracts
--   delinquent_contracts     open contracts with days_delinquent > 0

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id                            bigint GENERATED ALWAYS AS IDENTITY,
    kind                          text NOT NULL,
    as_of                         date NOT NULL,
    name                          text,
    note                          text,
    taken_at                      timestamptz NOT NULL DEFAULT now(),
    taken_by                      text NOT NULL,
    servicer                      text NOT NULL,
    source_file                   text,
    total_contracts               integer NOT NULL,
    active_contracts              integer NOT NULL,
    outstanding_receivables       numeric(18,2) NOT NULL,
    past_due                      numeric(18,2) NOT NULL,
    delinquent_contracts          integer NOT NULL,
    CONSTRAINT pk_portfolio_snapshots PRIMARY KEY (id),
    CONSTRAINT ck_portfolio_snapshots_kind CHECK (kind IN ('daily', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_snapshots_daily ON portfolio_snapshots (servicer, as_of) WHERE kind = 'daily';

CREATE TABLE IF NOT EXISTS portfolio_snapshot_contracts (
    snapshot_id                   bigint NOT NULL,
    as_of                         date NOT NULL,
    kind                          text NOT NULL,
    contract_no                   text NOT NULL,
    status                        text,
    is_open                       boolean,
    commencement_date             date,
    maturity_date                 date,
    term_months                   integer,
    original_cost                 numeric(18,2),
    residual                      numeric(18,2),
    monthly_payment               numeric(18,2),
    outstanding_receivables       numeric(18,2),
    past_due                      numeric(18,2),
    days_delinquent               integer,
    delinquency_bucket            text,
    servicer_row                  jsonb,
    CONSTRAINT pk_portfolio_snapshot_contracts PRIMARY KEY (snapshot_id, contract_no),
    CONSTRAINT fk_portfolio_snapshot_contracts_snapshot FOREIGN KEY (snapshot_id)
        REFERENCES portfolio_snapshots (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_portfolio_snapshot_contracts_contract_no ON portfolio_snapshot_contracts (contract_no);

-- The contract rows without servicer_row, for list pages: the servicer's row is some 200 fields
-- per contract and is only wanted one contract at a time.
-- CREATE OR REPLACE can add columns at the end but not rename, retype, reorder or drop one.
CREATE OR REPLACE VIEW portfolio_snapshot_contract_list AS
SELECT snapshot_id,
       as_of,
       kind,
       contract_no,
       status,
       is_open,
       commencement_date,
       maturity_date,
       term_months,
       original_cost,
       residual,
       monthly_payment,
       outstanding_receivables,
       past_due,
       days_delinquent,
       delinquency_bucket
  FROM portfolio_snapshot_contracts;

COMMENT ON TABLE portfolio_snapshots IS 'Frozen copies of the portfolio at a point in time: one row per snapshot with its totals. Contract rows are in portfolio_snapshot_contracts.';
COMMENT ON COLUMN portfolio_snapshots.id IS 'Snapshot id.';
COMMENT ON COLUMN portfolio_snapshots.kind IS 'daily = taken by the loader for a servicer file date; manual = taken on demand.';
COMMENT ON COLUMN portfolio_snapshots.as_of IS 'Date the data describes: the file date of the servicer data copied.';
COMMENT ON COLUMN portfolio_snapshots.name IS 'Name given to a manual snapshot. Null for daily ones.';
COMMENT ON COLUMN portfolio_snapshots.note IS 'Free-text note on a manual snapshot.';
COMMENT ON COLUMN portfolio_snapshots.taken_at IS 'When the snapshot was taken (a daily one: last rebuilt).';
COMMENT ON COLUMN portfolio_snapshots.taken_by IS 'Email of the user who took it, or loader.';
COMMENT ON COLUMN portfolio_snapshots.servicer IS 'Servicer the contract rows were copied from, e.g. vervent.';
COMMENT ON COLUMN portfolio_snapshots.source_file IS 'Servicer file a daily snapshot was taken from. Null for manual ones, whose rows name their own file in servicer_row.';
COMMENT ON COLUMN portfolio_snapshots.total_contracts IS 'Contracts in the snapshot, open and closed.';
COMMENT ON COLUMN portfolio_snapshots.active_contracts IS 'Contracts with is_open.';
COMMENT ON COLUMN portfolio_snapshots.outstanding_receivables IS 'Sum of outstanding_receivables over open contracts, USD.';
COMMENT ON COLUMN portfolio_snapshots.past_due IS 'Sum of past_due over open contracts, USD.';
COMMENT ON COLUMN portfolio_snapshots.delinquent_contracts IS 'Open contracts with days_delinquent > 0.';

COMMENT ON TABLE portfolio_snapshot_contracts IS 'One row per contract per portfolio snapshot: the contract as it was when the snapshot was taken.';
COMMENT ON COLUMN portfolio_snapshot_contracts.snapshot_id IS 'portfolio_snapshots.id.';
COMMENT ON COLUMN portfolio_snapshot_contracts.as_of IS 'The snapshot''s as_of, repeated here so rows can be filtered by date.';
COMMENT ON COLUMN portfolio_snapshot_contracts.kind IS 'The snapshot''s kind, repeated here so rows can be filtered by it.';
COMMENT ON COLUMN portfolio_snapshot_contracts.contract_no IS 'Contract (lease) number.';
COMMENT ON COLUMN portfolio_snapshot_contracts.status IS 'Servicer''s contract status code.';
COMMENT ON COLUMN portfolio_snapshot_contracts.is_open IS 'True while the account is open. The totals count open contracts only.';
COMMENT ON COLUMN portfolio_snapshot_contracts.commencement_date IS 'Start of the payment schedule.';
COMMENT ON COLUMN portfolio_snapshot_contracts.maturity_date IS 'Scheduled maturity date.';
COMMENT ON COLUMN portfolio_snapshot_contracts.term_months IS 'Contract term in months.';
COMMENT ON COLUMN portfolio_snapshot_contracts.original_cost IS 'Original cost financed, USD.';
COMMENT ON COLUMN portfolio_snapshot_contracts.residual IS 'Total residual value, USD.';
COMMENT ON COLUMN portfolio_snapshot_contracts.monthly_payment IS 'Current periodic payment, USD.';
COMMENT ON COLUMN portfolio_snapshot_contracts.outstanding_receivables IS 'Remaining scheduled receivables, USD.';
COMMENT ON COLUMN portfolio_snapshot_contracts.past_due IS 'Total past-due amount, USD.';
COMMENT ON COLUMN portfolio_snapshot_contracts.days_delinquent IS 'Days delinquent.';
COMMENT ON COLUMN portfolio_snapshot_contracts.delinquency_bucket IS 'Delinquency bucket: 1-30 ... 181+. Null = current.';
COMMENT ON COLUMN portfolio_snapshot_contracts.servicer_row IS 'The servicer''s whole contract row as it was (for vervent: the vervent_contracts columns, without loaded_at).';
