#!/usr/bin/env bash
# Load Vervent P50 daily extracts into the in-cluster Postgres with vervent/load.py.
#
#   deploy/load-vervent.sh                                  # every vervent/*_Daily_P50.csv
#   deploy/load-vervent.sh vervent/20261112_*_Daily_P50.csv
#
# load.py checks each header against vervent/sql before sending anything, loads each file in
# one transaction (oldest first) and stops at the first failure. Re-loading a file is safe:
# contracts and assets upsert (an older file never overwrites newer data), transactions skip
# keys already present.
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
if [ $# -eq 0 ]; then
    set -- vervent/*_Daily_P50.csv
fi
PSQL="kubectl -n $NS exec -i postgres-0 -- psql -U cambercredit -d cambercredit" \
    python3 vervent/load.py "$@"

kubectl -n "$NS" exec -i postgres-0 -- psql -U cambercredit -d cambercredit -X -c "
  select 'vervent_contracts' as tbl, file_date, count(*) from vervent_contracts group by 2
  union all select 'vervent_assets', file_date, count(*) from vervent_assets group by 2
  union all select 'vervent_transactions', file_date, count(*) from vervent_transactions group by 2
  order by 1, 2"
