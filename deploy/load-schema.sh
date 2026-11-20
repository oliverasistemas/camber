#!/usr/bin/env bash
# Create the portfolio tables (snapshots, portfolios and their leases), the vervent_* and copart_*
# tables and views and the load history (../portfolio/sql/0*.sql, ../vervent/sql/0*.sql,
# ../copart/sql/0*.sql) in the in-cluster Postgres. In that order: the Vervent and Copart views
# read the portfolio tables. Idempotent (CREATE ... IF NOT EXISTS), so it is safe to re-run; it
# does not alter existing columns.
#
#   deploy/load-schema.sh
#
# Streams each file through kubectl exec; psql connects over the pod-local socket, so no
# password is needed. Run before the first deploy of the app pod: it exits at startup if the
# tables are missing.
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
kubectl -n "$NS" rollout status statefulset/postgres --timeout=180s >/dev/null
for f in portfolio/sql/0*.sql vervent/sql/0*.sql copart/sql/0*.sql; do
    echo "=== $f"
    kubectl -n "$NS" exec -i postgres-0 -- \
        psql -U cambercredit -d cambercredit -X -q -v ON_ERROR_STOP=1 <"$f"
done
echo "schema load complete"
