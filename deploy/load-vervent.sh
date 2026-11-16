#!/usr/bin/env bash
# Load Vervent P50 daily extracts into the in-cluster Postgres with the Go loader
# (be/pipeline/cmd/load-vervent) over a kubectl port-forward.
#
#   deploy/load-vervent.sh                                  # every vervent/*_Daily_P50.csv
#   deploy/load-vervent.sh vervent/20261112_*_Daily_P50.csv
#
# The loader checks each header against the DDL in be/pipeline/vervent/sql before writing, loads
# each file in one transaction (oldest first), stops at the first failure and prints row counts
# by table and file_date. Re-loading a file is safe: contracts and assets upsert (an older file
# never overwrites newer data), transactions skip keys already present.
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
PORT=${PG_LOCAL_PORT:-15432}
if [ $# -eq 0 ]; then
    set -- vervent/*_Daily_P50.csv
fi
files=()
for f in "$@"; do files+=("$(realpath "$f")"); done

# postgres://cambercredit:<password>@postgres:5432/cambercredit -> localhost:$PORT
url=$(kubectl -n "$NS" get secret cambercredit-db -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
url=${url/@postgres:5432\//@127.0.0.1:$PORT/}
if [[ $url != *"@127.0.0.1:$PORT/"* ]]; then
    echo "DATABASE_URL in secret cambercredit-db is not ...@postgres:5432/...; can't point it at the port-forward" >&2
    exit 1
fi

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; }

# The credentials go to whatever answers on $PORT, so it must be our port-forward.
if port_open; then
    echo "127.0.0.1:$PORT is already in use; set PG_LOCAL_PORT to a free port" >&2
    exit 1
fi
kubectl -n "$NS" port-forward svc/postgres "$PORT:5432" >/dev/null &
pf=$!
trap 'kill $pf 2>/dev/null' EXIT
for _ in $(seq 50); do
    port_open && break
    sleep 0.2
done
if ! kill -0 "$pf" 2>/dev/null || ! port_open; then
    echo "kubectl port-forward to svc/postgres did not come up on 127.0.0.1:$PORT" >&2
    exit 1
fi

cd be
DATABASE_URL=$url go run ./pipeline/cmd/load-vervent "${files[@]}"
