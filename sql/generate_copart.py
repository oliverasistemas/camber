#!/usr/bin/env python3
"""Generate 03_copart.sql and the load_copart_<tab>.sql scripts from one column spec.

Copart's weekly "Camber_Sales_Inventory_Report" xlsx has two tabs, Inventory
and Sales. copart_to_csv.py turns each tab into a pipe-delimited CSV (dates
as YYYY-MM-DD, blanks for empty cells) and load.sh pipes those through the
scripts generated here, exactly like the Vervent reports. Re-run after editing
the spec:

    python3 sql/generate_copart.py

Column spec entry: (xlsx_header, column_name, kind[, comment])
  kind: date | bool | big | int | small | num2 | num | text
The parsers are the strict vervent.parse_* functions from 01_schema.sql.
"""
from __future__ import annotations

import os

HERE = os.path.dirname(os.path.abspath(__file__))

KIND_SQL = {
    "date": "date",
    "bool": "boolean",
    "big": "bigint",
    "int": "integer",
    "small": "smallint",
    "num2": "numeric(14,2)",
    "num": "numeric",
    "text": "text",
}

KIND_PARSE = {
    "date": "vervent.parse_date({c})",
    "bool": "vervent.parse_bool({c})",
    "big": "vervent.parse_num({c})::bigint",
    "int": "vervent.parse_num({c})::integer",
    "small": "vervent.parse_num({c})::smallint",
    "num2": "vervent.parse_num({c})",
    "num": "vervent.parse_num({c})",
    "text": "vervent.parse_text({c})",
}

# ---------------------------------------------------------------------------
# "Inventory Tab" — every lot Copart has handled for Camber (cumulative: sold
# and owner-retained lots stay on the tab), one row per lot. A VIN can appear
# twice when a vehicle was re-assigned after an owner-retain close.
# ---------------------------------------------------------------------------
INVENTORY = [
    ("vin", "vin", "text", "VIN; joins vervent.asset_summary.serial_number"),
    ("lot_nbr", "lot_nbr", "big", "Copart lot number, unique per assignment"),
    ("year", "year", "small"),
    ("make", "make", "text", "Copart make code (JEP, DODG, ...)"),
    ("model", "model", "text", "Copart model, truncated to 10 chars"),
    ("order_assignment_date", "order_assignment_date", "date", "Date Camber/Vervent assigned the pickup"),
    ("order_recieved_date", "order_received_date", "date", "Date the vehicle arrived in the yard (header spelled 'recieved' in the file)"),
    ("inventory_status", "inventory_status", "text", "READY FOR AUCTION, WAITING FOR ORIGINAL TITLE, SELLER HOLD PROGRAM, Closed, Closed - OWNER RETAINED, OWNER RETAIN-SELLER OWES US, ..."),
    ("physical_location", "physical_location", "text", "Copart yard, '<yard no> - <state> - <name>'"),
    ("location_state", "location_state", "text"),
    ("title_status", "title_status", "text", "Completed, Awaiting Original Document, Awaiting Transferable Title, Awaiting Title Processing"),
    ("reserve_set", "reserve_set", "bool", "Y/N"),
    ("reserve_amount_on_final_auction", "reserve_amount_on_final_auction", "num2"),
    ("days_in_yard", "days_in_yard", "int"),
    ("primary_damage", "primary_damage", "text"),
    ("secondary_damage", "secondary_damage", "text"),
    ("loss_type", "loss_type", "text", "FLEET/LEASE, VOLUNTARY REPO, REPOSSESSION"),
    ("odometer", "odometer", "int"),
    ("auto_grade_score", "auto_grade_score", "num", "Copart condition score, 0-5"),
    ("NADA_ACV_Value", "nada_acv_value", "num2", "NADA actual cash value"),
    ("proquote", "proquote", "num2", "Copart ProQuote estimated sale price"),
    ("drivability_rating", "drivability_rating", "text", "DRIVES, STARTS, NO"),
    ("date_of_sell", "date_of_sell", "date", "Populated exactly for the lots on the Sales tab"),
    ("est_repair_cost", "est_repair_cost", "num2"),
]

# ---------------------------------------------------------------------------
# "Sales Tab" — lots that ran at auction, one row per lot, with the sale
# economics. Every lot here is also on the Inventory tab.
# ---------------------------------------------------------------------------
SALES = [
    ("vin", "vin", "text", "VIN; joins vervent.asset_summary.serial_number"),
    ("lot_nbr", "lot_nbr", "big", "Copart lot number; joins copart.inventory"),
    ("year", "year", "small"),
    ("make", "make", "text"),
    ("model", "model", "text"),
    ("physical_location", "physical_location", "text"),
    ("location_state", "location_state", "text"),
    ("first_auction_date", "first_auction_date", "date"),
    ("sale_date", "sale_date", "date", "Date of the (last) auction run"),
    ("sales_status", "sales_status", "text", "Closed, WAITING FOR SELLER PAYMENT, READY FOR AUCTION (re-run, gross 0)"),
    ("runs_at_auction", "runs_at_auction", "small", "Number of auction runs"),
    ("total_bids", "total_bids", "int"),
    ("acv", "acv", "num2", "Actual cash value"),
    ("proquote", "proquote", "num2"),
    ("reserve_amount_on_final_auction", "reserve_amount_on_final_auction", "num2"),
    ("gross_sale_price", "gross_sale_price", "num2", "Hammer price; 0 when the lot has not sold yet"),
    ("total_advance_charges", "total_advance_charges", "num2"),
    ("total_copart_charges", "total_copart_charges", "num2"),
    ("total_seller_charges", "total_seller_charges", "num2", "Equals total_copart_charges in every file so far"),
    ("net_sale_proceeds", "net_sale_proceeds", "num2", "gross_sale_price - total_seller_charges"),
]

TABS = {
    "inventory": dict(
        cols=INVENTORY,
        sheet="Inventory Tab",
        not_null=("vin", "lot_nbr"),
        indexes=[("vin",), ("inventory_status",)],
        comment="Copart weekly Sales & Inventory report, Inventory tab: one row per lot per report date. Cumulative snapshot (sold and owner-retained lots remain).",
    ),
    "sales": dict(
        cols=SALES,
        sheet="Sales Tab",
        not_null=("vin", "lot_nbr"),
        indexes=[("vin",), ("sale_date",)],
        comment="Copart weekly Sales & Inventory report, Sales tab: one row per auctioned lot per report date, with sale economics.",
    ),
}

SCHEMA_HEAD = """-- =============================================================================
-- Camber — Copart weekly Sales & Inventory report
--   schema copart: typed tables mirroring the two tabs of the xlsx Copart's
--   BI scheduler emails every Friday (Camber_Sales_Inventory_Report_<ts>.xlsx),
--   a load registry, and views that pick the latest snapshot per lot and
--   reconcile Copart's net proceeds against Vervent's SALE PROCEEDS.
-- Dialect: PostgreSQL 14+. Idempotent: psql -v ON_ERROR_STOP=1 -f 03_copart.sql
-- Requires 01_schema.sql (the vervent.parse_* functions and asset_summary).
--
-- GENERATED by generate_copart.py from its column spec — edit the spec, not
-- this file. Column order follows the xlsx header; the "-- XLSX:" annotation
-- on each column is the exact header text it comes from.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS copart;

-- -----------------------------------------------------------------------------
-- Load registry — one row per loaded tab. Reloading a filename replaces its
-- rows (the tab tables cascade on file_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copart.report_file (
  file_id     serial       PRIMARY KEY,
  report_type text         NOT NULL CHECK (report_type IN ('inventory', 'sales')),
  asof_date   date         NOT NULL,   -- report date (timestamp in the xlsx filename)
  filename    text         NOT NULL UNIQUE,   -- the converted CSV, <YYYYMMDD>_Copart<Tab>.csv
  source_file text,                    -- the xlsx the tab came from
  sha256      char(64),                -- of the xlsx
  row_count   integer,
  loaded_at   timestamptz  NOT NULL DEFAULT now()
);
"""

SCHEMA_TAIL = """-- -----------------------------------------------------------------------------
-- Latest snapshot per lot. The weekly file is cumulative (every lot seen so
-- far is re-sent), so the newest row for a lot is its current state; a lot
-- that stops being sent keeps its last known row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW copart.inventory_current AS
SELECT DISTINCT ON (lot_nbr) *
FROM copart.inventory
ORDER BY lot_nbr, asof_date DESC;

CREATE OR REPLACE VIEW copart.sales_current AS
SELECT DISTINCT ON (lot_nbr) *
FROM copart.sales
ORDER BY lot_nbr, asof_date DESC;

-- -----------------------------------------------------------------------------
-- Copart net proceeds vs. Vervent SALE PROCEEDS, per auctioned lot, against
-- the newest Vervent asset summary. A VIN can have several asset rows (re-
-- leases, deficiency assets); the sold one wins, then the latest status.
--   reconciliation:
--     match            Vervent carries Copart's net proceeds to the cent
--     differs          Vervent carries a different amount -> override candidate
--     vervent_missing  Vervent has no sale proceeds yet (sale posted later)
--     not_sold         Copart lot ran but has not sold (gross 0)
--     no_vervent_asset VIN not in the asset summary
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW copart.sale_vs_vervent AS
WITH v AS (
  SELECT DISTINCT ON (serial_number)
         asof_date, serial_number, asset_no, lease, lease_no_norm, status,
         status_date, contr_status, sold_date, sale_proceeds
  FROM vervent.asset_summary
  WHERE asof_date = (SELECT max(asof_date) FROM vervent.asset_summary)
  ORDER BY serial_number, (status = 'USLD') DESC, status_date DESC NULLS LAST, asset_no DESC
)
SELECT s.asof_date            AS copart_asof,
       s.lot_nbr, s.vin, s.sale_date, s.sales_status,
       s.gross_sale_price, s.total_seller_charges, s.net_sale_proceeds,
       v.asof_date            AS vervent_asof,
       v.lease_no_norm        AS lease_no,
       v.asset_no,
       v.status               AS vervent_asset_status,
       v.contr_status         AS vervent_contr_status,
       v.sold_date            AS vervent_sold_date,
       v.sale_proceeds        AS vervent_sale_proceeds,
       CASE
         WHEN v.asset_no IS NULL                                    THEN 'no_vervent_asset'
         WHEN coalesce(s.gross_sale_price, 0) = 0                   THEN 'not_sold'
         WHEN coalesce(v.sale_proceeds, 0) = 0                      THEN 'vervent_missing'
         WHEN v.sale_proceeds = s.net_sale_proceeds                 THEN 'match'
         ELSE 'differs'
       END                    AS reconciliation,
       s.net_sale_proceeds - coalesce(v.sale_proceeds, 0) AS copart_minus_vervent
FROM copart.sales_current s
LEFT JOIN v ON v.serial_number = s.vin;

COMMENT ON VIEW copart.inventory_current IS 'Newest copart.inventory row per lot_nbr across all loaded report dates.';
COMMENT ON VIEW copart.sales_current IS 'Newest copart.sales row per lot_nbr across all loaded report dates.';
COMMENT ON VIEW copart.sale_vs_vervent IS 'Each auctioned Copart lot next to the matching Vervent asset (newest asset summary) with a reconciliation flag; rows flagged differs/vervent_missing are the sale-proceeds overrides for the loan tape.';
"""


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def check_spec() -> None:
    for name, r in TABS.items():
        cols = [c[1] for c in r["cols"]]
        assert len(cols) == len(set(cols)), f"{name}: duplicate column names"
        for c in r["cols"]:
            assert c[2] in KIND_SQL, f"{name}.{c[1]}: unknown kind {c[2]}"


def table_ddl(name: str, r: dict) -> str:
    cols = r["cols"]
    not_null = set(r["not_null"])
    width = max(len(c[1]) for c in cols) + 1
    lines = [
        "-- -----------------------------------------------------------------------------",
        f"-- copart.{name}  (xlsx sheet \"{r['sheet']}\")",
        "-- -----------------------------------------------------------------------------",
        f"CREATE TABLE IF NOT EXISTS copart.{name} (",
        f"  {'file_id':<{width}} integer NOT NULL REFERENCES copart.report_file (file_id) ON DELETE CASCADE,",
        f"  {'asof_date':<{width}} date NOT NULL,",
    ]
    for c in cols:
        hdr, col, kind = c[0], c[1], c[2]
        nn = " NOT NULL" if col in not_null else ""
        lines.append(f"  {col:<{width}} {KIND_SQL[kind]}{nn},  -- XLSX: {hdr}")
    lines.append(f"  {'loaded_at':<{width}} timestamptz NOT NULL DEFAULT now(),")
    lines.append("  PRIMARY KEY (asof_date, lot_nbr)")
    lines.append(");")
    for idx in r["indexes"]:
        iname = f"{name}_{'_'.join(idx)}_idx"
        lines.append(f"CREATE INDEX IF NOT EXISTS {iname} ON copart.{name} ({', '.join(idx)});")
    lines.append(f"COMMENT ON TABLE copart.{name} IS {sql_str(r['comment'])};")
    for c in cols:
        if len(c) > 3:
            lines.append(f"COMMENT ON COLUMN copart.{name}.{c[1]} IS {sql_str(c[3])};")
    return "\n".join(lines) + "\n"


def load_sql(name: str, r: dict) -> str:
    cols = r["cols"]
    header = "|".join(c[0] for c in cols)
    src_cols = []
    for i, c in enumerate(cols):
        comma = "," if i < len(cols) - 1 else ""
        src_cols.append(f"  {c[1] + ' text' + comma:<34} -- XLSX: {c[0]}")
    target_cols = ", ".join(c[1] for c in cols)
    parsed = ",\n".join(f"  {KIND_PARSE[c[2]].format(c=c[1])}" for c in cols)
    upd_cols = [c[1] for c in cols if c[1] != "lot_nbr"]
    upd = ",\n".join(f"  {c} = EXCLUDED.{c}" for c in ["file_id"] + upd_cols + ["loaded_at"])
    lines = [
        "-- GENERATED by generate_copart.py — do not edit by hand.",
        f"-- Loads one converted Copart {name} CSV (copart_to_csv.py) into copart.{name}.",
        "-- Called by load.sh with:",
        "--   -v filename=<csv basename> -v asof=<YYYY-MM-DD> -v source=<xlsx basename>",
        "--   -v sha=<sha256 of the xlsx> -v rows=<data row count>",
        f"-- HEADER: {header}",
        "\\set ON_ERROR_STOP on",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE src (",
        *src_cols,
        ") ON COMMIT DROP;",
        "",
        "-- the CSV is piped in on psql's stdin by load.sh (\\copy does not interpolate variables)",
        "\\copy src FROM pstdin WITH (FORMAT csv, DELIMITER '|', NULL '', HEADER true, ENCODING 'UTF8')",
        "",
        "DELETE FROM copart.report_file WHERE filename = :'filename';",
        "INSERT INTO copart.report_file (report_type, asof_date, filename, source_file, sha256, row_count)",
        f"VALUES ('{name}', :'asof'::date, :'filename', nullif(:'source', ''), nullif(:'sha', ''), :'rows'::int)",
        "RETURNING file_id \\gset",
        "",
        f"INSERT INTO copart.{name} (file_id, asof_date, {target_cols})",
        "SELECT :file_id, :'asof'::date,",
        parsed,
        "FROM src",
        "ON CONFLICT (asof_date, lot_nbr) DO UPDATE SET",
        upd + ";",
        "",
        "COMMIT;",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    check_spec()
    schema = SCHEMA_HEAD + "\n" + "\n".join(table_ddl(n, r) for n, r in TABS.items()) + "\n" + SCHEMA_TAIL
    with open(os.path.join(HERE, "03_copart.sql"), "w") as f:
        f.write(schema)
    for n, r in TABS.items():
        with open(os.path.join(HERE, f"load_copart_{n}.sql"), "w") as f:
            f.write(load_sql(n, r))
    print("wrote 03_copart.sql and load_copart_*.sql:",
          ", ".join(f"{n} ({len(r['cols'])} cols)" for n, r in TABS.items()))


if __name__ == "__main__":
    main()
