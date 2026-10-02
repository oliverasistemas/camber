# Deploying the dashboard

Runs on the inmatics aws009 Kubernetes cluster (kubectl context `aws009`),
in its own `camber` namespace, pinned to the QA node. One pod serves the API
and the SPA (see `../dashboard/Dockerfile`), one StatefulSet runs plain
Postgres 16 with the lease tape, and Traefik + cert-manager (already on the
cluster) terminate TLS for **https://camber.inmatics.io**.

First-time setup, in order:

```sh
deployments/create-secrets.sh        # namespace, DB/login secrets, ECR pull creds
deployments/push-dashboard.sh 1.0.0  # build + push the image to ECR
deployments/deploy.sh                # kubectl apply -k deployments/k8s
deployments/load-data.sh             # schema + lease tape; tie-outs must all pass
aws route53 change-resource-record-sets \
    --hosted-zone-id Z08940481XIPFSNAHWVPV \
    --change-batch file://deployments/dns/camber.json
```

To ship a new build: `push-dashboard.sh <new-tag>` (ECR tags are immutable),
bump `newTag` in `k8s/kustomization.yaml`, run `deploy.sh`, commit the pin.

Sign-in credentials live in the `camber-secrets` Secret (`DASH_USER` /
`DASH_PASS`). The Postgres password is generated once by `create-secrets.sh`
and must never be regenerated — the data directory on the node
(`/srv/camber-pgdata` on aws009) is initialized with it.
