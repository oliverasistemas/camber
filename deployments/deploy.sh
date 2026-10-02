#!/usr/bin/env bash
# Apply the camber stack to the aws009 cluster and wait for it to come up.
#
#   deployments/deploy.sh
#
# First-time setup, in order:
#   1. deployments/create-secrets.sh      (namespace + secrets)
#   2. deployments/push-dashboard.sh TAG  (image into ECR; pin TAG in
#                                          k8s/kustomization.yaml)
#   3. deployments/deploy.sh              (this script)
#   4. deployments/load-data.sh           (schema + lease tape into Postgres)
#   5. DNS once: aws route53 change-resource-record-sets \
#        --hosted-zone-id Z08940481XIPFSNAHWVPV \
#        --change-batch file://deployments/dns/camber.json
set -euo pipefail

cd "$(dirname "$0")"

kubectl apply -k k8s
kubectl -n camber rollout status statefulset/postgres --timeout=180s
kubectl -n camber rollout status deployment/camber-dashboard --timeout=180s
kubectl -n camber get pods
