#!/usr/bin/env python3
"""Load Vervent P50 daily extracts into the vervent_* tables.

    vervent/load.py vervent/20261111_*_Daily_P50.csv
    deploy/load-vervent.sh vervent/2026111*_*.csv                    # into the cluster

The column mapping comes from the DDL in sql/0*_vervent_*.sql: each column's COMMENT starts with
the source header in brackets and, for dates, ends with "Source format <fmt>". The header of every
file is checked against it before anything is sent to the database, so a renamed or added column
fails the load instead of shifting data.

Each file loads in one transaction, streamed to `psql -f -` (COPY ... FROM STDIN inline), so the
same script works against a remote pod through `kubectl exec -i`. Files are loaded oldest first;
contracts and assets upsert so that an older file never overwrites newer data, transactions are
append-only. PSQL defaults to `psql -d cambercredit`.
"""

import os
import re
import shlex
import subprocess
import sys
from datetime import date
from pathlib import Path

SQL_DIR = Path(__file__).resolve().parent / "sql"
META_COLUMNS = {"source_file", "file_date", "loaded_at"}
DATE_FORMATS = {"MM/DD/YYYY": "MM/DD/YYYY", "YYYYMMDD": "YYYYMMDD", "YYMMDD": "YYMMDD"}
FILE_RE = re.compile(r"^(\d{8})_(AssetSummary|ContractSummary|TransactionHistory)_Daily_P50\.csv$")

# report -> (table, ddl file, primary key, upsert?)
REPORTS = {
    "ContractSummary": ("vervent_contracts", "01_vervent_contracts.sql", "lease_no", True),
    "AssetSummary": ("vervent_assets", "02_vervent_assets.sql", "asset_no", True),
    "TransactionHistory": ("vervent_transactions", "03_vervent_transactions.sql", "transaction_key", False),
}


def parse_ddl(table, ddl_file):
    """Returns [(column, type, source_header, date_format)] in table order, metadata excluded."""
    sql = (SQL_DIR / ddl_file).read_text()
    body = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\n\);", sql, re.S).group(1)
    comments = {
        col: text
        for col, text in re.findall(rf"COMMENT ON COLUMN {table}\.\"?(\w+)\"? IS '((?:[^']|'')*)';", sql)
    }
    cols = []
    for line in body.splitlines():
        m = re.match(r'\s+("?\w+"?)\s+(.+?),?$', line)
        if not m or m.group(1) == "CONSTRAINT":
            continue
        col, typ = m.group(1).strip('"'), m.group(2).replace(" NOT NULL", "")
        if col in META_COLUMNS:
            continue
        comment = comments[col]
        header = re.match(r"\[([^\]]+)\]", comment).group(1)
        fmt = None
        if typ == "date":
            fmt = DATE_FORMATS[re.search(r"Source format (\S+?)\.?$", comment).group(1)]
        cols.append((col, typ, header, fmt))
    return cols


def quote_ident(col):
    return f'"{col}"' if col in {"trim", "off"} else col


def cast(expr, typ, fmt):
    v = f"NULLIF(btrim({expr}), '')"
    if typ == "text":
        return v
    if typ == "date":
        return f"to_date({v}, '{fmt}')"
    if typ == "boolean":
        return (f"CASE {v} WHEN '1' THEN true WHEN 'True' THEN true "
                f"WHEN '0' THEN false WHEN 'False' THEN false END")
    return f"{v}::{typ}"


def build_sql(path, report, file_date, header):
    table, ddl_file, key, upsert = REPORTS[report]
    cols = parse_ddl(table, ddl_file)
    by_header = {h: (c, t, f) for c, t, h, f in cols}

    unknown = [h for h in header if h not in by_header]
    missing = [h for _, _, h, _ in cols if h not in header]
    if unknown or missing or len(set(header)) != len(header):
        raise SystemExit(f"{path.name}: header does not match {ddl_file}\n"
                         f"  unknown columns: {unknown}\n  missing columns: {missing}")

    stg = ", ".join(f"c{i} text" for i in range(len(header)))
    targets = [by_header[h][0] for h in header]
    exprs = [cast(f"c{i}", by_header[h][1], by_header[h][2]) for i, h in enumerate(header)]
    name = path.name.replace("'", "''")

    insert = (f"INSERT INTO {table} ({', '.join(map(quote_ident, targets))}, source_file, file_date)\n"
              f"SELECT {', '.join(exprs)}, '{name}', DATE '{file_date}'\nFROM stg\n")
    if upsert:
        sets = ", ".join(f"{quote_ident(c)} = EXCLUDED.{quote_ident(c)}" for c in targets if c != key)
        insert += (f"ON CONFLICT ({key}) DO UPDATE SET {sets}, source_file = EXCLUDED.source_file, "
                   f"file_date = EXCLUDED.file_date, loaded_at = now()\n"
                   f"WHERE {table}.file_date <= EXCLUDED.file_date;\n")
    else:
        insert += f"ON CONFLICT ({key}) DO NOTHING;\n"

    head = ("\\set ON_ERROR_STOP on\nBEGIN;\n"
            f"CREATE TEMP TABLE stg ({stg}) ON COMMIT DROP;\n"
            "COPY stg FROM STDIN WITH (FORMAT csv, DELIMITER '|', HEADER true, "
            "QUOTE E'\\x01', ENCODING 'LATIN1');\n")
    tail = (f"\\.\n{insert}"
            f"SELECT '{name}' AS file, count(*) AS rows_in_file FROM stg;\nCOMMIT;\n")
    return head, tail


def load(path, psql):
    m = FILE_RE.match(path.name)
    if not m:
        raise SystemExit(f"{path.name}: expected YYYYMMDD_<AssetSummary|ContractSummary|"
                         f"TransactionHistory>_Daily_P50.csv")
    d, report = m.groups()
    file_date = date(int(d[:4]), int(d[4:6]), int(d[6:]))

    # The extracts are CRLF without a final newline; COPY needs one consistent newline style
    # (Postgres 16 rejects mixed ones), so normalize to LF.
    data = path.read_bytes().removeprefix(b"\xef\xbb\xbf").replace(b"\r\n", b"\n")
    first = data.split(b"\n", 1)[0].decode("latin-1")
    header = [h.strip() for h in first.split("|")]
    if b"\n\\.\n" in data:
        raise SystemExit(f"{path.name}: contains a line '\\.', which would end COPY early")

    head, tail = build_sql(path, report, file_date, header)
    if not data.endswith(b"\n"):
        data += b"\n"
    stream = head.encode() + data + tail.encode()
    print(f"=== {path.name} ({report}, {file_date})", flush=True)
    subprocess.run([*psql, "-X", "-q", "-f", "-"], input=stream, check=True)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    psql = shlex.split(os.environ.get("PSQL", "psql -d cambercredit"))
    paths = [Path(p) for p in sys.argv[1:]]
    # Oldest first, and within a day contracts before assets before transactions.
    order = list(REPORTS)
    paths.sort(key=lambda p: (p.name[:8], next((i for i, r in enumerate(order) if r in p.name), 9)))
    for p in paths:
        try:
            load(p, psql)
        except subprocess.CalledProcessError:
            raise SystemExit(f"{p.name}: load failed and was rolled back; later files not attempted")


if __name__ == "__main__":
    main()
