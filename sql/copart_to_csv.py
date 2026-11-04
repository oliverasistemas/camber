#!/usr/bin/env python3
"""Split a Copart Camber_Sales_Inventory_Report xlsx into two pipe-delimited CSVs.

    python3 sql/copart_to_csv.py <report.xlsx> <out dir> [--asof YYYY-MM-DD]

Writes <out dir>/<YYYYMMDD>_CopartInventory.csv and <YYYYMMDD>_CopartSales.csv
(one per tab, header row kept verbatim, dates as YYYY-MM-DD, empty cells
blank) and prints their paths, one per line. load.sh then loads them with
load_copart_<tab>.sql, whose "-- HEADER:" line must match the tab's header.

The as-of date comes from the filename: the 14-digit timestamp Copart's
scheduler appends (Camber_Sales_Inventory_Report_20261030051005.xlsx) or a
YYYY-MM-DD / YYYYMMDD anywhere in the name; --asof is the fallback when the
name carries no date (load.sh passes the inbox folder date).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import re
import sys

import openpyxl

TABS = {"Inventory Tab": "CopartInventory", "Sales Tab": "CopartSales"}


def asof_from_name(name: str) -> dt.date | None:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", name) or re.search(r"(\d{4})(\d{2})(\d{2})\d*", name)
    if not m:
        return None
    try:
        return dt.date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, dt.datetime):
        if v.time() != dt.time(0):
            raise SystemExit(f"unexpected time-of-day in date cell: {v}")
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    if "|" in s or "\n" in s:
        raise SystemExit(f"cell contains a delimiter or newline: {s!r}")
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("out_dir")
    ap.add_argument("--asof", type=dt.date.fromisoformat)
    a = ap.parse_args()

    asof = asof_from_name(os.path.basename(a.xlsx)) or a.asof
    if asof is None:
        raise SystemExit(f"cannot determine as-of date from {a.xlsx}; pass --asof")

    wb = openpyxl.load_workbook(a.xlsx, read_only=True, data_only=True)
    missing = [t for t in TABS if t not in wb.sheetnames]
    if missing:
        raise SystemExit(f"{a.xlsx}: missing sheet(s) {missing}; has {wb.sheetnames}")

    os.makedirs(a.out_dir, exist_ok=True)
    for sheet, stem in TABS.items():
        rows = wb[sheet].iter_rows(values_only=True)
        header = [str(h).strip() for h in next(rows)]
        while header and header[-1] in ("", "None"):
            header.pop()
        out = os.path.join(a.out_dir, f"{asof:%Y%m%d}_{stem}.csv")
        n = 0
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter="|", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
            w.writerow(header)
            for r in rows:
                vals = [cell(v) for v in r[: len(header)]]
                if not any(vals):
                    continue
                w.writerow(vals)
                n += 1
        print(out)
        print(f"  {sheet}: {n} rows", file=sys.stderr)


if __name__ == "__main__":
    main()
