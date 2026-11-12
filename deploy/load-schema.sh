#!/usr/bin/env bash
# Create the vervent_* tables (../vervent/sql/0*.sql) in the in-cluster Postgres. Idempotent
# (CREATE ... IF NOT EXISTS), so it is safe to re-run; it does not alter existing columns.
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
for f in vervent/sql/0*.sql; do
    echo "=== $f"
    kubectl -n "$NS" exec -i postgres-0 -- \
        psql -U cambercredit -d cambercredit -X -q -v ON_ERROR_STOP=1 <"$f"
done
echo "schema load complete"
