# Deploying the dashboard

Runs on the inmatics aws009 Kubernetes cluster (kubectl context `aws009`),
in its own `camber` namespace, pinned to the QA node. One pod serves the API
and the SPA (see `../dashboard/Dockerfile`), one StatefulSet runs plain
Postgres 16 with the lease tape, and Traefik + cert-manager (already on the
cluster) terminate TLS for **https://camber.inmatics.io**.

First-time setup, in order:

```sh
export GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…   # see ../dashboard/README.md "Sign-in"
deployments/create-secrets.sh        # namespace, DB + Google sign-in secrets, ECR pull creds
deployments/push-dashboard.sh 1.0.0  # build + push the image to ECR
deployments/deploy.sh                # kubectl apply -k deployments/k8s
deployments/load-data.sh             # vervent schema + code lookups (sql/01, sql/02)
aws route53 change-resource-record-sets \
    --hosted-zone-id Z08940481XIPFSNAHWVPV \
    --change-batch file://deployments/dns/camber.json
```

To load a Vervent sFTP drop into the cluster database, see
[`IMPORT-VERVENT.md`](IMPORT-VERVENT.md).

To ship a new build: `push-dashboard.sh <new-tag>` (ECR tags are immutable),
bump `newTag` in `k8s/kustomization.yaml`, run `deploy.sh`, commit the pin.

Sign-in is Google-based: the OAuth client ID/secret and the cookie-signing
key live in the `camber-auth` Secret, and `k8s/dashboard.yaml` sets
`PUBLIC_URL` and `AUTH_ALLOWED_DOMAIN` (`cambercredit.com`) in the clear. To
add an outside address, set `AUTH_ALLOWED_EMAILS` (comma-separated) on the
container. Deleting `camber-auth` and rerunning `create-secrets.sh` rotates
the session key, which just signs everyone out.

The Postgres password in `camber-secrets` is generated once by
`create-secrets.sh` and must never be regenerated — the data directory on
the node (`/srv/camber-pgdata` on aws009) is initialized with it.
