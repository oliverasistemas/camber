"""Shared helpers for the Camber collections pipeline (no external deps beyond openpyxl)."""

import csv
import datetime as dt
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
SQL = HERE / "sql"

DB = os.environ.get("CAMBER_DB", "camber")
PSQL = os.environ.get("PSQL", "psql")


def norm_col(name):
    """Normalize a report header to snake_case. Must stay in sync with the
    staging-table column names in sql/10_schema.sql."""
    s = str(name).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    if re.match(r"^[0-9]", s):
        s = "c_" + s
    return s


def fmt(v):
    """Render a cell for CSV: ISO dates, plain ints, empty string for NULL."""
    if v is None:
        return ""
    if isinstance(v, dt.datetime):
        return v.date().isoformat() if v.time() == dt.time() else v.isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return str(v)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def xlsx_sheet_to_csv(xlsx_path, sheet_name, out_csv):
    """Dump one worksheet to CSV with normalized headers.

    Vervent reports sometimes carry a one-cell title row (e.g. "Transaction
    History Report ...") above the real header; skip leading rows until a row
    with 3+ non-empty cells appears.
    """
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb[sheet_name] if sheet_name else wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = None
    for row in it:
        if sum(1 for v in row if v not in (None, "")) >= 3:
            header = list(row)
            break
    if header is None:
        raise SystemExit(f"{xlsx_path}: no header row found in sheet {ws.title!r}")
    while header and header[-1] is None:
        header = header[:-1]
    ncol = len(header)
    cols = [norm_col(h) if h is not None else f"col_{i+1}" for i, h in enumerate(header)]
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for row in it:
            vals = [fmt(v) for v in row[:ncol]]
            if any(v != "" for v in vals):
                w.writerow(vals)
                n += 1
    return cols, n


def csv_header(path):
    with open(path, newline="") as f:
        return next(csv.reader(f))


def psql(*args, sql=None, variables=None, check=True, quiet=False):
    """Run psql against the pipeline database. `variables` become -v name=value."""
    cmd = [PSQL, "-d", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1"]
    for k, v in (variables or {}).items():
        cmd += ["-v", f"{k}={v}"]
    cmd += list(args)
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if r.stdout and not quiet:
        sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        if check:
            raise SystemExit(f"psql failed ({r.returncode})")
    elif r.stderr:
        sys.stderr.write(r.stderr)
    return r
