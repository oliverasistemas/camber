-- portfolios / portfolio_leases: which leases are Camber's, and the portfolio each belongs to.
-- Loaded from Camber's own list ("Camber Credit - Lease IDs & Portfolios.xlsx") by
-- portfolio/load.py, not from a servicer file. The servicer's tables hold every lease it services
-- under the same servicer portfolio; a lease that is not in portfolio_leases is not Camber's, and
-- the dashboard leaves it out of everything it counts.
--
-- Servicer-neutral, like the snapshots: lease_id is Camber's lease id (for Vervent,
-- vervent_contracts.camber_lease_id), so a lease's follow-on contracts (deficiencies) belong to
-- the portfolio of the lease. The views that put the portfolio on a servicer's rows are with that
-- servicer's DDL (vervent/sql/05_portfolio_views.sql), which is why this directory loads first.
--
-- The list is the whole truth each time it is loaded: a lease missing from a newer list loses its
-- portfolio, and a portfolio left without leases is removed.

CREATE TABLE IF NOT EXISTS portfolios (
    name                          text NOT NULL,
    loaded_at                     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_portfolios PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS portfolio_leases (
    lease_id                      text NOT NULL,
    portfolio                     text NOT NULL,
    source_file                   text NOT NULL,
    loaded_at                     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_portfolio_leases PRIMARY KEY (lease_id),
    CONSTRAINT fk_portfolio_leases_portfolio FOREIGN KEY (portfolio)
        REFERENCES portfolios (name) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_portfolio_leases_portfolio ON portfolio_leases (portfolio);

COMMENT ON TABLE portfolios IS 'Camber''s portfolios, as named in the lease list.';
COMMENT ON COLUMN portfolios.name IS '[Portfolio] Portfolio name, e.g. Camber Credit 2026-1 (Securitized).';
COMMENT ON COLUMN portfolios.loaded_at IS 'Timestamp the portfolio first appeared in a lease list.';

COMMENT ON TABLE portfolio_leases IS 'The leases Camber owns and the portfolio of each. A lease absent from here is not Camber''s.';
COMMENT ON COLUMN portfolio_leases.lease_id IS '[IDX] Camber lease id: the ten-digit lease number.';
COMMENT ON COLUMN portfolio_leases.portfolio IS '[Portfolio] portfolios.name.';
COMMENT ON COLUMN portfolio_leases.source_file IS 'Name of the lease list the row was loaded from.';
COMMENT ON COLUMN portfolio_leases.loaded_at IS 'Timestamp the row was inserted or its portfolio last changed.';
