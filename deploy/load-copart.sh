#!/usr/bin/env bash
# Load the weekly Copart seller report (Inventory and Sales tabs) into the in-cluster Postgres
# with copart/load.py.
#
#   deploy/load-copart.sh                                                  # every copart/*.xlsx
#   deploy/load-copart.sh copart/CamberSalesInventorySalesReport_2026-10-12.xlsx
#
# load.py checks both sheet headers against copart/sql before sending anything, loads each file in
# one transaction (oldest first) and stops at the first failure. Re-loading a file is safe: rows
# upsert on lot_nbr and an older report never overwrites newer data. Needs openpyxl locally.
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
if [ $# -eq 0 ]; then
    set -- copart/CamberSalesInventorySalesReport_*.xlsx
fi
PSQL="kubectl -n $NS exec -i postgres-0 -- psql -U cambercredit -d cambercredit" \
    python3 copart/load.py "$@"

kubectl -n "$NS" exec -i postgres-0 -- psql -U cambercredit -d cambercredit -X -c "
  select 'copart_inventory' as tbl, file_date, count(*) from copart_inventory group by 2
  union all select 'copart_sales', file_date, count(*) from copart_sales group by 2
  order by 1, 2"
