#!/usr/bin/env bash
# Create the vervent schema (../sql) in the in-cluster Postgres: tables, parser
# functions and the code lookups. Idempotent (IF NOT EXISTS / ON CONFLICT DO
# NOTHING), so it is safe to re-run after regenerating the SQL.
#
#   deployments/load-data.sh
#
# Streams each file through kubectl exec (psql connects over the pod-local
# socket, no password needed). Report CSVs are NOT loaded here: sql/load.sh
# loads them locally, and what gets published to the cluster is decided by the
# dashboard design (the reports carry lessee personal data).
set -euo pipefail

cd "$(dirname "$0")/.."

for f in sql/01_schema.sql \
         sql/02_codes.sql; do
    echo "=== $f"
    kubectl -n camber exec -i postgres-0 -- \
        psql -U camber -d camber -v ON_ERROR_STOP=1 -q <"$f"
done
echo "schema load complete"
