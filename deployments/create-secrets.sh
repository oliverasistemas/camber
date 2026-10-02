#!/usr/bin/env bash
# One-time bootstrap of the camber namespace secrets. Idempotent, and it
# NEVER regenerates an existing camber-secrets — the Postgres data directory
# was initialized with that password, so regenerating would lock the app out.
#
#   deployments/create-secrets.sh
#
# Creates:
#   camber-secrets   POSTGRES_* for the DB pod, DATABASE_URL + DASH_USER/
#                    DASH_PASS for the dashboard pod
#   ecr-creds        docker pull secret (then kept fresh by the CronJob)
#   ecr-refresh-aws  AWS key pair for the refresher, copied from inmatics-qa
set -euo pipefail

NS=camber
ACCOUNT_ID=032401303688
REGION=us-east-1
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

if kubectl -n "$NS" get secret camber-secrets >/dev/null 2>&1; then
    echo "camber-secrets already exists — leaving it alone"
else
    PG_PASSWORD=$(openssl rand -hex 16)
    kubectl -n "$NS" create secret generic camber-secrets \
        --from-literal=POSTGRES_USER=camber \
        --from-literal=POSTGRES_DB=camber \
        --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
        --from-literal=DATABASE_URL="postgres://camber:$PG_PASSWORD@postgres:5432/camber" \
        --from-literal=DASH_USER=russell \
        --from-literal=DASH_PASS=camber2026
    echo "created camber-secrets"
fi

# Fresh ECR token now; the ecr-creds-refresh CronJob keeps it alive after.
kubectl -n "$NS" create secret docker-registry ecr-creds \
    --docker-server="$REGISTRY" \
    --docker-username=AWS \
    --docker-password="$(aws ecr get-login-password --region "$REGION")" \
    --dry-run=client -o yaml | kubectl apply -f -
echo "ecr-creds refreshed"

# The refresher's AWS key pair already lives in the inmatics-qa namespace.
kubectl -n inmatics-qa get secret ecr-refresh-aws -o json |
    python3 -c 'import json,sys; s=json.load(sys.stdin); [s["metadata"].pop(k,None) for k in ("namespace","resourceVersion","uid","creationTimestamp","managedFields")]; print(json.dumps(s))' |
    kubectl -n "$NS" apply -f -
echo "ecr-refresh-aws copied from inmatics-qa"
