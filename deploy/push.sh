#!/usr/bin/env bash
# Build the app image (Go API + built SPA, ../Dockerfile) and push it to ECR.
#
#   deploy/push.sh <tag>
#
# k8s/kustomization.yaml pins the tag the cluster runs. To ship: push a new tag here, set
# newTag there, run deploy/deploy.sh. The repo has immutable tags, so always push a fresh one.
set -euo pipefail

cd "$(dirname "$0")/.."

ACCOUNT_ID=032401303688
REGION=us-east-1
REPO=cambercredit/app
TAG="${1:?usage: deploy/push.sh <tag>}"
IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:$TAG"

aws ecr get-login-password --region "$REGION" |
    docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 ||
    aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
        --image-tag-mutability IMMUTABLE >/dev/null

docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

echo "pushed $IMAGE"
