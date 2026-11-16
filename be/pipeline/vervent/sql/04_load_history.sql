-- Load history: one row per loader invocation (load_runs) and one per file it attempted
-- (load_files). Written by the loaders, not loaded from vendor files; shared by every loader
-- (loader = 'vervent' | 'copart'). The data tables' source_file/file_date/loaded_at only show the
-- latest load of each row, since an upsert overwrites them; these tables keep every attempt.
--
-- A run row is committed before any file loads, so a run that fails is still recorded. A file's
-- 'ok' row is written in the same transaction as its data, so 'ok' means committed; a 'failed'
-- row is written after the rollback. A file refused by the checks before loading is 'failed'
-- with no counts.

CREATE TABLE IF NOT EXISTS load_runs (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loader       text NOT NULL,
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
    error        text,
    invoked_by   text,
    args         text[]
);

COMMENT ON TABLE load_runs IS 'One row per loader invocation. status stays running if the process died before finishing.';
COMMENT ON COLUMN load_runs.loader IS 'Which loader ran: vervent or copart.';
COMMENT ON COLUMN load_runs.invoked_by IS 'LOAD_INVOKED_BY if set (for example a Job name), else user@host of the process.';
COMMENT ON COLUMN load_runs.args IS 'File arguments as given, in the order they were loaded.';

CREATE TABLE IF NOT EXISTS load_files (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id        bigint NOT NULL REFERENCES load_runs (id),
    source_file   text NOT NULL,
    file_date     date,
    table_name    text,
    sha256        text,
    bytes         bigint,
    rows_in_file  bigint,
    inserted      bigint,
    updated       bigint,
    skipped       bigint,
    status        text NOT NULL CHECK (status IN ('ok', 'failed')),
    error         text,
    started_at    timestamptz NOT NULL,
    finished_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS load_files_run_id ON load_files (run_id);
CREATE INDEX IF NOT EXISTS load_files_sha256 ON load_files (sha256);

COMMENT ON TABLE load_files IS 'One row per file a run attempted. Files after a failure are not attempted and get no row.';
COMMENT ON COLUMN load_files.source_file IS 'File base name, as stored in the data tables'' source_file.';
COMMENT ON COLUMN load_files.file_date IS 'Date from the file name prefix; NULL if the name did not parse.';
COMMENT ON COLUMN load_files.sha256 IS 'Hex SHA-256 of the file as read; NULL if it could not be read.';
COMMENT ON COLUMN load_files.inserted IS 'Rows inserted as new keys (RETURNING xmax = 0).';
COMMENT ON COLUMN load_files.updated IS 'Existing keys updated (file_date guard passed).';
COMMENT ON COLUMN load_files.skipped IS 'rows_in_file - inserted - updated: keys whose stored file_date is newer, or transaction keys already present.';
