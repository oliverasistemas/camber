#!/usr/bin/env bash
# Push one month of the pipeline-built loan tape to the in-cluster Postgres —
# dashboard tables only (camber_credit.lease_snapshots / lease_valuations).
# Source is the local camber database that pipeline/run.py publish wrote to;
# the raw/staging schemas (vervent_raw, camber_ops — these hold lessee PII)
# intentionally stay local.
#
#   deployments/load-pipeline.sh 2026-08-31
#
# Replaces the month's rows transactionally (DELETE + COPY), then prints the
# resulting row counts from the cluster.
set -euo pipefail

ASOF="${1:?usage: load-pipeline.sh YYYY-MM-DD}"
LOCAL_DB="${CAMBER_DB:-camber}"

SNAP_COLS="lease_id, asof_date, status_code, termination_type, termination_timing_category, sold_month, net_sales_proceeds, period_payment_collected, days_delinquent, payments_remaining, is_eligible_collateral"
VAL_COLS="lease_id, asof_date, discount_rate, pv_total, pv_contract_residual, pv_eligible_collateral"

{
  echo '\set ON_ERROR_STOP 1'
  echo 'BEGIN;'
  echo "DELETE FROM camber_credit.lease_snapshots WHERE asof_date = '$ASOF';"
  echo "COPY camber_credit.lease_snapshots ($SNAP_COLS) FROM stdin (FORMAT csv);"
  psql -d "$LOCAL_DB" -X -q -c "\\copy (SELECT $SNAP_COLS FROM camber_credit.lease_snapshots WHERE asof_date = '$ASOF' ORDER BY lease_id) TO STDOUT (FORMAT csv)"
  echo '\.'
  echo "DELETE FROM camber_credit.lease_valuations WHERE asof_date = '$ASOF';"
  echo "COPY camber_credit.lease_valuations ($VAL_COLS) FROM stdin (FORMAT csv);"
  psql -d "$LOCAL_DB" -X -q -c "\\copy (SELECT $VAL_COLS FROM camber_credit.lease_valuations WHERE asof_date = '$ASOF' ORDER BY lease_id) TO STDOUT (FORMAT csv)"
  echo '\.'
  echo 'COMMIT;'
  echo "SELECT 'lease_snapshots' AS loaded, count(*) FROM camber_credit.lease_snapshots WHERE asof_date = '$ASOF'
        UNION ALL
        SELECT 'lease_valuations', count(*) FROM camber_credit.lease_valuations WHERE asof_date = '$ASOF';"
} | kubectl -n camber exec -i postgres-0 -- psql -U camber -d camber -q
echo "push complete for $ASOF"
