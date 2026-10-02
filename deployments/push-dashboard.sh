#!/usr/bin/env bash
# Build the dashboard image (Go API + built SPA) and push it to ECR.
#
#   deployments/push-dashboard.sh [tag]     (tag defaults to 1.0.0)
#
# k8s/kustomization.yaml pins the tag the cluster runs. To ship a new build:
# push a new tag here, set newTag there, re-apply (deploy.sh). The repo is
# immutable-tags, so always push a fresh tag.
set -euo pipefail

cd "$(dirname "$0")/.."

ACCOUNT_ID=032401303688
REGION=us-east-1
REPO=camber/dashboard
TAG="${1:-1.0.0}"
IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:$TAG"

aws ecr get-login-password --region "$REGION" |
    docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 ||
    aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
        --image-tag-mutability IMMUTABLE >/dev/null

docker build --platform linux/amd64 -f dashboard/Dockerfile -t "$IMAGE" dashboard
docker push "$IMAGE"

echo "pushed $IMAGE"
