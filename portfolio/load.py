#!/usr/bin/env python3
"""Load Camber's lease list into portfolios and portfolio_leases: which leases are Camber's and
the portfolio of each.

    portfolio/load.py "portfolio/Camber Credit - Lease IDs & Portfolios.xlsx"
    deploy/load-portfolios.sh                                        # into the cluster

The first sheet has one row per lease under the headers in the COMMENTs of sql/02_portfolios.sql
(IDX, Portfolio); any other header fails the load. The list is the whole truth: in one transaction
the leases in it are upserted, the leases missing from it lose their portfolio, and a portfolio
left without leases is removed. Loading the same list again changes nothing.

It then labels the portfolio snapshot rows that have no portfolio yet (snapshots taken before the
list existed) with their lease's portfolio; a row that already has one keeps it.

Streamed to `psql -f -` like copart/load.py, so the same script works against a remote pod through
`kubectl exec -i`. Needs openpyxl. PSQL defaults to `psql -d cambercredit`.
"""

import csv
import io
import os
import re
import shlex
import subprocess
import sys
from collections import Counter
from pathlib import Path

import openpyxl

DDL = Path(__file__).resolve().parent / "sql" / "02_portfolios.sql"
TABLE = "portfolio_leases"


def headers():
    """{source header: column} for the loaded columns of portfolio_leases, from the DDL comments."""
    return {h: c for c, h in re.findall(rf"COMMENT ON COLUMN {TABLE}\.(\w+) IS '\[([^\]]+)\]", DDL.read_text())}


def cell(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():  # a lease number Excel stored as a number
        v = int(v)
    return str(v).strip()


def read(path):
    """Returns [(lease_id, portfolio)] after checking the sheet."""
    rows = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)
    by_header = headers()
    header = [cell(h) for h in next(rows)]
    if sorted(header) != sorted(by_header):
        raise SystemExit(f"{path.name}: header {header} does not match {DDL.name}, which expects {list(by_header)}")
    lease, portfolio = (header.index(h) for h, c in sorted(by_header.items(), key=lambda hc: hc[1]))
    leases = [(cell(r[lease]), cell(r[portfolio])) for r in rows if any(v is not None for v in r)]
    if not leases:
        raise SystemExit(f"{path.name}: no leases; an empty list would take every lease out of its portfolio")
    blank = sum(1 for lease_id, name in leases if not lease_id or not name)
    repeated = [k for k, n in Counter(lease_id for lease_id, _ in leases).items() if n > 1]
    if blank or repeated:
        raise SystemExit(f"{path.name}: {blank} rows without a lease id or a portfolio; "
                         f"lease ids listed more than once: {repeated[:10]}")
    return leases


def load(path, psql):
    leases = read(path)
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(leases)
    name = path.name.replace("'", "''")
    sql = f"""\\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE stg (lease_id text, portfolio text);
COPY stg FROM STDIN WITH (FORMAT csv);
{buf.getvalue()}\\.
SELECT (SELECT count(*) FROM stg) AS leases_in_file,
       (SELECT count(*) FROM stg WHERE NOT EXISTS (SELECT 1 FROM {TABLE} pl WHERE pl.lease_id = stg.lease_id)) AS added,
       (SELECT count(*) FROM stg JOIN {TABLE} pl USING (lease_id) WHERE pl.portfolio <> stg.portfolio) AS moved,
       (SELECT count(*) FROM {TABLE} pl WHERE NOT EXISTS (SELECT 1 FROM stg WHERE stg.lease_id = pl.lease_id)) AS removed;
INSERT INTO portfolios (name) SELECT DISTINCT portfolio FROM stg ON CONFLICT (name) DO NOTHING;
DELETE FROM {TABLE} pl WHERE NOT EXISTS (SELECT 1 FROM stg WHERE stg.lease_id = pl.lease_id);
INSERT INTO {TABLE} (lease_id, portfolio, source_file)
SELECT lease_id, portfolio, '{name}' FROM stg
ON CONFLICT (lease_id) DO UPDATE SET portfolio = EXCLUDED.portfolio, source_file = EXCLUDED.source_file, loaded_at = now()
WHERE {TABLE}.portfolio <> EXCLUDED.portfolio;
DELETE FROM portfolios p WHERE NOT EXISTS (SELECT 1 FROM {TABLE} pl WHERE pl.portfolio = p.name);
WITH labelled AS (
    UPDATE portfolio_snapshot_contracts sc SET portfolio = pl.portfolio
      FROM {TABLE} pl WHERE pl.lease_id = sc.lease_id AND sc.portfolio IS NULL
    RETURNING 1)
SELECT count(*) AS snapshot_rows_labelled FROM labelled;
SELECT portfolio, count(*) AS leases FROM {TABLE} GROUP BY 1 ORDER BY 1;
DROP TABLE stg;
COMMIT;
"""
    print(f"=== {path.name}", flush=True)
    subprocess.run([*psql, "-X", "-q", "-f", "-"], input=sql.encode(), check=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    psql = shlex.split(os.environ.get("PSQL", "psql -d cambercredit"))
    path = Path(sys.argv[1])
    try:
        load(path, psql)
    except subprocess.CalledProcessError:
        raise SystemExit(f"{path.name}: load failed and was rolled back")


if __name__ == "__main__":
    main()
