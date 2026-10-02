#!/usr/bin/env bash
# Load the lease-tape schema and data (../sql) into the in-cluster Postgres.
# Idempotent only in the sense that 01_schema.sql uses CREATE SCHEMA IF NOT
# EXISTS but plain CREATE for types/tables — on a database that already has
# the schema this script fails fast rather than duplicating rows. To reload
# from scratch: DROP SCHEMA camber_credit CASCADE first.
#
#   deployments/load-data.sh
#
# Streams each file through kubectl exec (psql connects over the pod-local
# socket, no password needed). 07_tieout_checks.sql is the verification —
# every row it prints should show pass = t.
set -euo pipefail

cd "$(dirname "$0")/.."

for f in sql/01_schema.sql \
         sql/02_reference_data.sql \
         sql/03_load_vehicles.sql \
         sql/04_load_leases.sql \
         sql/05_load_lease_snapshots.sql \
         sql/06_load_lease_valuations.sql \
         sql/07_tieout_checks.sql; do
    echo "=== $f"
    kubectl -n camber exec -i postgres-0 -- \
        psql -U camber -d camber -v ON_ERROR_STOP=1 -q <"$f"
done
echo "load complete"
