#!/usr/bin/env bash
# One-time bootstrap of the app's secrets in the camber namespace. Idempotent, and it NEVER
# regenerates an existing cambercredit-db: the Postgres data directory is initialized with that
# password, so regenerating would lock the app out.
#
#   deploy/create-secrets.sh
#
# Creates:
#   cambercredit-db    POSTGRES_* for the DB pod, DATABASE_URL for the app pod
#   cambercredit-auth  google-client.json (the OAuth client JSON, default: the repo's
#                      client_secret_*.json, override with GOOGLE_CLIENT_SECRET_FILE), a
#                      generated SESSION_SECRET, and AUTH_ALLOWED_EMAILS (outside addresses
#                      admitted besides @cambercredit.com, comma-separated; from the
#                      environment, default empty)
#   ecr-creds          docker pull secret (then kept fresh by the CronJob)
#   ecr-refresh-aws    AWS key pair for the refresher, copied from inmatics-qa
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
ACCOUNT_ID=032401303688
REGION=us-east-1
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

if kubectl -n "$NS" get secret cambercredit-db >/dev/null 2>&1; then
    echo "cambercredit-db already exists — leaving it alone"
else
    PG_PASSWORD=$(openssl rand -hex 16)
    kubectl -n "$NS" create secret generic cambercredit-db \
        --from-literal=POSTGRES_USER=cambercredit \
        --from-literal=POSTGRES_DB=cambercredit \
        --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
        --from-literal=DATABASE_URL="postgres://cambercredit:$PG_PASSWORD@postgres:5432/cambercredit"
    echo "created cambercredit-db"
fi

# The OAuth client already lists https://camber.inmatics.io/api/auth/google/callback as a
# redirect URI. Regenerating SESSION_SECRET (delete the Secret and rerun) signs everyone out,
# nothing worse.
if kubectl -n "$NS" get secret cambercredit-auth >/dev/null 2>&1; then
    echo "cambercredit-auth already exists — leaving it alone"
else
    CLIENT_FILE="${GOOGLE_CLIENT_SECRET_FILE:-$(ls client_secret_*.json 2>/dev/null | head -1)}"
    [ -f "$CLIENT_FILE" ] || { echo "no OAuth client JSON: put client_secret_*.json at the repo root or set GOOGLE_CLIENT_SECRET_FILE" >&2; exit 1; }
    kubectl -n "$NS" create secret generic cambercredit-auth \
        --from-file=google-client.json="$CLIENT_FILE" \
        --from-literal=SESSION_SECRET="$(openssl rand -hex 32)" \
        --from-literal=AUTH_ALLOWED_EMAILS="${AUTH_ALLOWED_EMAILS:-}"
    echo "created cambercredit-auth (client: $CLIENT_FILE, AUTH_ALLOWED_EMAILS='${AUTH_ALLOWED_EMAILS:-}')"
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
