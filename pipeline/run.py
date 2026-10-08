#!/usr/bin/env python3
"""Camber collections pipeline CLI.

Monthly flow (see README.md):
  python3 run.py init                              # create schemas
  python3 run.py seed-pool data/seed/pool_2026_1.csv
  python3 run.py seed-prior data/seed/prior_tape_2026-07-31.csv --asof 2026-07-31
  python3 run.py fetch --asof 2026-08-31           # pull Vervent files from sFTP
  python3 run.py stage data/inbox/2026-08-31/* --asof 2026-08-31
  python3 run.py load-overrides data/overrides/overrides_2026-08-31.csv
  python3 run.py copart-suggest --asof 2026-08-31  # propose Copart-based overrides
  python3 run.py build --asof 2026-08-31           # generate the loan tape
  python3 run.py load-expected data/expected/expected_tape_2026-08-31.csv --asof 2026-08-31
  python3 run.py tieout --asof 2026-08-31          # verify vs Brad's workbook
  python3 run.py publish --asof 2026-08-31         # upsert dashboard tables
"""

import argparse
import calendar
import csv
import datetime as dt
import re
import sys
from pathlib import Path

from common import DATA, SQL, csv_header, fmt, norm_col, psql, sha256_file, xlsx_sheet_to_csv

# --- report registry ----------------------------------------------------------
# pattern: matched against the lowercased filename with punctuation stripped.
# key_col: source of lease_id_norm when the file doesn't carry one.
REPORTS = [
    dict(rtype="trans_history", table="vervent_raw.trans_history",
         key_col="contract_number", pattern=r"trans(action)?hist"),
    dict(rtype="asset_summary", table="vervent_raw.asset_summary",
         key_col="lease", pattern=r"assetsummary"),
    dict(rtype="contract_summary", table="vervent_raw.contract_summary",
         key_col="lease_no", pattern=r"contractsummary"),
    dict(rtype="eot_charges", table="vervent_raw.eot_charges",
         key_col=None, pattern=r"eot|endofterm"),
    dict(rtype="lease_term_report", table="camber_ops.lease_term_report",
         key_col=None, pattern=r"leaseterm"),
    dict(rtype="cb_offboarded", table="camber_ops.cb_offboarded_accounts",
         key_col=None, pattern=r"offboard"),
    # Copart weekly sales & inventory workbook: two sheets, two tables
    dict(rtype="copart_sales", table="camber_ops.copart_sales",
         key_col=None, pattern=r"salesinventory", sheet="Sales Tab"),
    dict(rtype="copart_inventory", table="camber_ops.copart_inventory",
         key_col=None, pattern=r"salesinventory", sheet="Inventory Tab"),
    # Copart portal lot export
    dict(rtype="copart_lot_inventory", table="camber_ops.copart_lot_inventory",
         key_col=None, pattern=r"copartinventory|lotsearch"),
]


def detect_reports(path):
    name = re.sub(r"[^a-z0-9]", "", Path(path).name.lower())
    return [r for r in REPORTS if re.search(r["pattern"], name)]


def detect_asof(path):
    name = Path(path).name
    m = re.search(r"(\d{4})[.\-](\d{2})[.\-](\d{2})", name)
    return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def table_columns(table):
    schema, name = table.split(".")
    r = psql("-tA", "-c",
             "SELECT column_name FROM information_schema.columns"
             f" WHERE table_schema = '{schema}' AND table_name = '{name}'"
             " ORDER BY ordinal_position", quiet=True)
    return [c for c in r.stdout.split() if c]


def load_csv_into(table, rtype, csv_path, asof, key_col=None):
    """Stage one CSV: register the file, replace this (rtype, asof) slice,
    map CSV columns to table columns by normalized name."""
    header = [norm_col(h) for h in csv_header(csv_path)]
    target_cols = set(table_columns(table)) - {"load_seq", "file_id", "asof_date"}
    cols = [c for c in header if c in target_cols]
    missing = target_cols - set(header) - {"lease_id_norm"}
    if not cols:
        raise SystemExit(f"{csv_path}: no columns match {table}")
    tmp_ddl = ", ".join(f"{norm_col(h)} text" for h in header)
    collist = ", ".join(cols)
    with open(csv_path, newline="") as f:
        nrows = sum(1 for _ in csv.reader(f)) - 1
    script = f"""
BEGIN;
DELETE FROM vervent_raw.file_registry WHERE report_type = :'rtype' AND asof_date = :'asof';
INSERT INTO vervent_raw.file_registry (report_type, asof_date, filename, sha256, row_count)
VALUES (:'rtype', :'asof', :'fname', :'sha', :rowcount) RETURNING file_id \\gset
CREATE TEMP TABLE t_load ({tmp_ddl});
\\copy t_load FROM '{csv_path}' WITH (FORMAT csv, HEADER true)
INSERT INTO {table} (file_id, asof_date, {collist})
SELECT :file_id, :'asof', {collist} FROM t_load;
"""
    if "lease_id_norm" in target_cols and key_col:
        script += f"""
UPDATE {table} SET lease_id_norm = camber_ops.norm_lease_id({key_col})
WHERE asof_date = :'asof' AND coalesce(lease_id_norm, '') = '';
"""
    script += "COMMIT;\n"
    psql(sql=script, variables={
        "rtype": rtype, "asof": asof.isoformat(), "fname": Path(csv_path).name,
        "sha": sha256_file(csv_path), "rowcount": nrows,
    })
    note = f" (unmapped table cols: {sorted(missing)})" if missing else ""
    print(f"staged {rtype} <- {Path(csv_path).name}: {nrows} rows -> {table}{note}")


def cmd_stage(args):
    asof_flag = dt.date.fromisoformat(args.asof) if args.asof else None
    for path in args.files:
        path = Path(path)
        if path.name.startswith(".") or path.suffix.lower() not in (".csv", ".xlsx"):
            continue
        reports = detect_reports(path)
        if args.type:
            reports = [r for r in REPORTS if r["rtype"] == args.type]
        if not reports:
            print(f"skip {path.name}: unrecognized report (use --type)", file=sys.stderr)
            continue
        asof = asof_flag or detect_asof(path) or (
            detect_asof(path.parent) if re.match(r"\d{4}-\d{2}-\d{2}", path.parent.name) else None)
        if asof is None and re.match(r"\d{4}-\d{2}-\d{2}$", path.parent.name):
            asof = dt.date.fromisoformat(path.parent.name)
        if asof is None:
            raise SystemExit(f"{path.name}: cannot determine as-of date; pass --asof")
        for rep in reports:
            if path.suffix.lower() == ".xlsx":
                out = DATA / "staged_csv" / f"{path.stem}.{rep['rtype']}.csv"
                try:
                    xlsx_sheet_to_csv(path, rep.get("sheet"), out)
                except KeyError:
                    print(f"skip {path.name}: no sheet {rep.get('sheet')!r}", file=sys.stderr)
                    continue
                src = out
            else:
                src = path
            load_csv_into(rep["table"], rep["rtype"], src, asof, rep.get("key_col"))


def cmd_seed_pool(args):
    cols = csv_header(args.csv)
    collist = ", ".join(cols)
    script = f"""
BEGIN;
CREATE TEMP TABLE t_pool (LIKE camber_ops.pool INCLUDING DEFAULTS);
\\copy t_pool ({collist}) FROM '{args.csv}' WITH (FORMAT csv, HEADER true)
INSERT INTO camber_ops.pool ({collist})
SELECT {collist} FROM t_pool
ON CONFLICT (lease_id) DO NOTHING;
COMMIT;
SELECT count(*) AS pool_leases FROM camber_ops.pool;
"""
    psql("-a", sql=script)


def cmd_seed_prior(args):
    """Load a prior-month carry-forward (partial loan_tape row set) so the
    first pipeline month has its month-over-month inputs."""
    cols = csv_header(args.csv)
    collist = ", ".join(cols)
    script = f"""
BEGIN;
CREATE TEMP TABLE t_prior ({', '.join(c + ' text' for c in cols)});
\\copy t_prior FROM '{args.csv}' WITH (FORMAT csv, HEADER true)
DELETE FROM camber_credit.loan_tape WHERE asof_date = :'asof';
INSERT INTO camber_credit.loan_tape (lease_id, asof_date, camber_lease_status,
  sold_month, net_sales_proceeds, total_ar_final, pv9_total_excl_ppt,
  cum_cash_flow, cum_property_tax, cum_sales_tax)
SELECT lease_id::bigint, :'asof'::date,
  camber_ops.parse_num(camber_lease_status)::smallint,
  nullif(substring(btrim(sold_month), 1, 7), ''),
  camber_ops.parse_num(net_sales_proceeds),
  camber_ops.parse_num(total_ar_final),
  camber_ops.parse_num(pv9_total_excl_ppt),
  camber_ops.parse_num(cum_cash_flow),
  camber_ops.parse_num(cum_property_tax),
  camber_ops.parse_num(cum_sales_tax)
FROM t_prior;
COMMIT;
"""
    psql(sql=script, variables={"asof": args.asof})
    print(f"seeded prior tape {args.asof} from {args.csv}")


def cmd_load_overrides(args):
    script = f"""
BEGIN;
CREATE TEMP TABLE t_ov (lease_id text, asof_date text, field text, value text,
                        source text, reason text);
\\copy t_ov FROM '{args.csv}' WITH (FORMAT csv, HEADER true)
INSERT INTO camber_ops.overrides (lease_id, asof_date, field, value, source, reason)
SELECT lease_id::bigint, asof_date::date, field, value, source, reason FROM t_ov
ON CONFLICT (lease_id, asof_date, field)
DO UPDATE SET value = excluded.value, source = excluded.source,
              reason = excluded.reason, loaded_at = now();
COMMIT;
SELECT field, count(*) FROM camber_ops.overrides GROUP BY 1 ORDER BY 1;
"""
    psql("-a", sql=script)


def cmd_load_expected(args):
    cols = csv_header(args.csv)
    collist = ", ".join(cols)
    script = f"""
BEGIN;
DELETE FROM camber_ops.expected_tape WHERE asof_date = :'asof';
CREATE TEMP TABLE t_exp ({', '.join(c + ' text' for c in cols)});
\\copy t_exp FROM '{args.csv}' WITH (FORMAT csv, HEADER true)
INSERT INTO camber_ops.expected_tape (asof_date, {collist})
SELECT :'asof'::date, {collist} FROM t_exp;
COMMIT;
"""
    psql(sql=script, variables={"asof": args.asof})
    print(f"loaded expected tape {args.asof} from {args.csv}")


def month_bounds(asof):
    return asof.replace(day=1)


def build_vars(args):
    asof = dt.date.fromisoformat(args.asof)
    period_start = (dt.date.fromisoformat(args.period_start)
                    if getattr(args, "period_start", None) else month_bounds(asof))
    prior_asof = period_start - dt.timedelta(days=1)
    return {
        "asof": asof.isoformat(),
        "period_start": period_start.isoformat(),
        "prior_asof": prior_asof.isoformat(),
        "pool_start": getattr(args, "pool_start", None) or "2025-11-01",
        "discount_rate": "0.09",
        "ppt_rate": "0.00951684788251831",   # 2025 personal-property-tax proration
        "eol_mileage_assumption": "765",     # 0.45 incidence x $1700 x 100% collection
        "eol_wear_assumption": "360",        # 0.40 incidence x $900  x 100% collection
    }


def cmd_build(args):
    psql("-f", str(SQL / "20_build_tape.sql"), variables=build_vars(args))


def cmd_tieout(args):
    psql("-f", str(SQL / "40_tieout.sql"), variables={"asof": args.asof})


def cmd_publish(args):
    psql("-f", str(SQL / "30_publish.sql"), variables={"asof": args.asof,
                                                       "discount_rate": "0.09"})


def cmd_init(args):
    psql("-f", str(SQL / "10_schema.sql"))
    print("schemas ready")


def cmd_copart_suggest(args):
    psql("-f", str(SQL / "50_copart_overrides.sql"), variables={"asof": args.asof})


def cmd_fetch(args):
    import fetch
    fetch.fetch(args.asof)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="create schemas").set_defaults(fn=cmd_init)

    s = sub.add_parser("stage", help="stage Vervent/Copart report files (xlsx or csv)")
    s.add_argument("files", nargs="+")
    s.add_argument("--asof", help="as-of date (default: parsed from filename/dir)")
    s.add_argument("--type", choices=[r["rtype"] for r in REPORTS])
    s.set_defaults(fn=cmd_stage)

    s = sub.add_parser("seed-pool", help="load static pool attributes")
    s.add_argument("csv")
    s.set_defaults(fn=cmd_seed_pool)

    s = sub.add_parser("seed-prior", help="load prior-month tape carry-forward")
    s.add_argument("csv")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_seed_prior)

    s = sub.add_parser("load-overrides", help="load manual overrides CSV")
    s.add_argument("csv")
    s.set_defaults(fn=cmd_load_overrides)

    s = sub.add_parser("load-expected", help="load expected tie-out values CSV")
    s.add_argument("csv")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_load_expected)

    s = sub.add_parser("copart-suggest", help="propose sale overrides from Copart sales data")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_copart_suggest)

    s = sub.add_parser("build", help="generate the loan tape for a month")
    s.add_argument("--asof", required=True)
    s.add_argument("--period-start", help="default: 1st of the as-of month")
    s.add_argument("--pool-start", help="default: 2025-11-01")
    s.set_defaults(fn=cmd_build)

    s = sub.add_parser("tieout", help="compare loan tape vs expected values")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_tieout)

    s = sub.add_parser("publish", help="upsert dashboard tables from the loan tape")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_publish)

    s = sub.add_parser("fetch", help="download Vervent reports from sFTP")
    s.add_argument("--asof", required=True)
    s.set_defaults(fn=cmd_fetch)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
