#!/usr/bin/env bash
# Apply the stack to the camber namespace on the aws009 cluster and wait for it to come up.
#
#   deploy/deploy.sh
#
# See README.md for the first-time order.
set -euo pipefail

cd "$(dirname "$0")"

NS=camber

kubectl apply -k k8s
kubectl -n "$NS" rollout status statefulset/postgres --timeout=180s
kubectl -n "$NS" rollout status deployment/cambercredit --timeout=180s
kubectl -n "$NS" get pods
