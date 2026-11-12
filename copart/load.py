#!/usr/bin/env python3
"""Load the Inventory Tab of the weekly Copart seller report into copart_inventory.

    copart/load.py copart/CamberSalesInventorySalesReport_2026-10-05.xlsx
    deploy/load-copart.sh                                            # into the cluster

The column mapping comes from sql/01_copart_inventory.sql: each column's COMMENT starts with the
source header in brackets. The sheet header is checked against it before anything is sent, so a
renamed or added column fails the load instead of shifting data.

Each file loads in one transaction, streamed to `psql -f -` (COPY ... FROM STDIN inline), so the
same script works against a remote pod through `kubectl exec -i`. Files are loaded oldest first
and upsert on lot_nbr; an older report never overwrites newer data. Needs openpyxl. PSQL defaults
to `psql -d cambercredit`.
"""

import csv
import io
import os
import re
import shlex
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl

DDL = Path(__file__).resolve().parent / "sql" / "01_copart_inventory.sql"
TABLE, KEY, SHEET = "copart_inventory", "lot_nbr", "Inventory Tab"
META_COLUMNS = {"source_file", "file_date", "loaded_at"}
FILE_RE = re.compile(r"^CamberSalesInventorySalesReport_(\d{4}-\d{2}-\d{2})\.xlsx$")


def parse_ddl():
    """Returns [(column, type, source_header)] in table order, metadata excluded."""
    sql = DDL.read_text()
    body = re.search(rf"CREATE TABLE IF NOT EXISTS {TABLE} \((.*?)\n\);", sql, re.S).group(1)
    headers = dict(re.findall(rf"COMMENT ON COLUMN {TABLE}\.(\w+) IS '\[([^\]]+)\]", sql))
    cols = []
    for line in body.splitlines():
        m = re.match(r"\s+(\w+)\s+(.+?),?$", line)
        if not m or m.group(1) == "CONSTRAINT" or m.group(1) in META_COLUMNS:
            continue
        cols.append((m.group(1), m.group(2).replace(" NOT NULL", ""), headers[m.group(1)]))
    return cols


def cast(expr, typ):
    v = f"NULLIF(btrim({expr}), '')"
    if typ == "text":
        return v
    if typ == "boolean":
        return f"CASE upper({v}) WHEN 'Y' THEN true WHEN 'N' THEN false END"
    return f"{v}::{typ}"


def cell(v):
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v)


def load(path, psql):
    m = FILE_RE.match(path.name)
    if not m:
        raise SystemExit(f"{path.name}: expected CamberSalesInventorySalesReport_YYYY-MM-DD.xlsx")
    file_date = m.group(1)

    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)[SHEET]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() for h in next(rows)]
    cols = parse_ddl()
    by_header = {h: (c, t) for c, t, h in cols}
    unknown = [h for h in header if h not in by_header]
    missing = [h for _, _, h in cols if h not in header]
    if unknown or missing or len(set(header)) != len(header):
        raise SystemExit(f"{path.name}: header does not match {DDL.name}\n"
                         f"  unknown columns: {unknown}\n  missing columns: {missing}")

    buf = io.StringIO()
    out = csv.writer(buf, lineterminator="\n")
    for r in rows:
        if any(v is not None for v in r):
            out.writerow(cell(v) for v in r)

    targets = [by_header[h][0] for h in header]
    exprs = [cast(f"c{i}", by_header[h][1]) for i, h in enumerate(header)]
    sets = ", ".join(f"{c} = EXCLUDED.{c}" for c in targets if c != KEY)
    name = path.name.replace("'", "''")
    sql = ("\\set ON_ERROR_STOP on\nBEGIN;\n"
           f"CREATE TEMP TABLE stg ({', '.join(f'c{i} text' for i in range(len(header)))}) ON COMMIT DROP;\n"
           "COPY stg FROM STDIN WITH (FORMAT csv);\n"
           f"{buf.getvalue()}\\.\n"
           f"INSERT INTO {TABLE} ({', '.join(targets)}, source_file, file_date)\n"
           f"SELECT {', '.join(exprs)}, '{name}', DATE '{file_date}'\nFROM stg\n"
           f"ON CONFLICT ({KEY}) DO UPDATE SET {sets}, source_file = EXCLUDED.source_file, "
           f"file_date = EXCLUDED.file_date, loaded_at = now()\n"
           f"WHERE {TABLE}.file_date <= EXCLUDED.file_date;\n"
           f"SELECT '{name}' AS file, count(*) AS rows_in_file FROM stg;\nCOMMIT;\n")
    print(f"=== {path.name} ({SHEET}, {file_date})", flush=True)
    subprocess.run([*psql, "-X", "-q", "-f", "-"], input=sql.encode(), check=True)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    psql = shlex.split(os.environ.get("PSQL", "psql -d cambercredit"))
    for p in sorted((Path(a) for a in sys.argv[1:]), key=lambda p: p.name):
        try:
            load(p, psql)
        except subprocess.CalledProcessError:
            raise SystemExit(f"{p.name}: load failed and was rolled back; later files not attempted")


if __name__ == "__main__":
    main()
