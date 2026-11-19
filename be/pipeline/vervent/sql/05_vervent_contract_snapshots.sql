-- vervent_contract_snapshots: one row per contract per ContractSummary file date, so that
-- outstanding receivables and delinquency can be charted over time. vervent_contracts only keeps
-- the latest state of each contract (the upsert overwrites it); this table keeps every day.
--
-- Written by the Vervent loader in the same transaction as the vervent_contracts upsert, from the
-- same staging rows and with the same casts, so each column's type and meaning are those of the
-- vervent_contracts column of the same name. The columns copied are listed in
-- be/pipeline/vervent/ddl.go (Report.Snapshot): adding one means adding it here (plus an
-- ALTER TABLE on a live database) and there, then re-loading the ContractSummary files to fill it.
--
-- Unlike vervent_contracts, a file older than the newest one loaded still writes its rows here:
-- that is how history is backfilled. Re-loading a file replaces that day's rows for the contracts
-- in it. A contract missing from a day's file has no row for that day.

CREATE TABLE IF NOT EXISTS vervent_contract_snapshots (
    file_date                     date NOT NULL,
    lease_no                      text NOT NULL,
    ls_status                     text,
    account_status                text,
    is_account_open               boolean,
    remaining_receivables         numeric(18,2),
    past_due_receivables          numeric(18,2),
    total_past_due                numeric(18,2),
    days_del                      integer,
    curr_delinq                   text,
    source_file                   text NOT NULL,
    loaded_at                     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_vervent_contract_snapshots PRIMARY KEY (file_date, lease_no)
);

CREATE INDEX IF NOT EXISTS ix_vervent_contract_snapshots_lease_no ON vervent_contract_snapshots (lease_no);

COMMENT ON TABLE vervent_contract_snapshots IS 'Daily history of the vervent_contracts fields behind the receivables and delinquency metrics: one row per contract per ContractSummary file date.';
COMMENT ON COLUMN vervent_contract_snapshots.file_date IS 'As-of date of the ContractSummary file (from its name).';
COMMENT ON COLUMN vervent_contract_snapshots.lease_no IS '[LEASE NO] Contract (lease) number; vervent_contracts.lease_no.';
COMMENT ON COLUMN vervent_contract_snapshots.ls_status IS '[LS STATUS] Contract status code that day.';
COMMENT ON COLUMN vervent_contract_snapshots.account_status IS '[AccountStatus] Active or Closed that day.';
COMMENT ON COLUMN vervent_contract_snapshots.is_account_open IS '[IsAccountOpen] 1 = Active, 0 = Closed that day. The metrics count open contracts only.';
COMMENT ON COLUMN vervent_contract_snapshots.remaining_receivables IS '[REMAINING RECEIVABLES] Remaining scheduled receivables that day, USD.';
COMMENT ON COLUMN vervent_contract_snapshots.past_due_receivables IS '[PAST DUE RECEIVABLES] Past-due amount that day, USD; negative = credit balance.';
COMMENT ON COLUMN vervent_contract_snapshots.total_past_due IS '[TOTAL PAST DUE] Total past-due amount that day, USD.';
COMMENT ON COLUMN vervent_contract_snapshots.days_del IS '[DAYS_DEL] Days delinquent that day.';
COMMENT ON COLUMN vervent_contract_snapshots.curr_delinq IS '[CURR_DELINQ] Delinquency bucket that day: 1-30 ... 181+. Blank = current.';
COMMENT ON COLUMN vervent_contract_snapshots.source_file IS 'File the row was loaded from.';
COMMENT ON COLUMN vervent_contract_snapshots.loaded_at IS 'When the row was last written.';
