# Deploying cambercredit

Runs on the inmatics aws009 Kubernetes cluster (kubectl context `aws009`) in the `camber`
namespace, pinned to the QA node, at **https://camber.inmatics.io**. It replaced the old
camber-dashboard app in place on 2026-11-12. Its manifests (`deployments/`, removed; see git
history before `aaf23da`) must not be re-applied: they would put the old app and database back.
One pod serves the API and the SPA
(`../Dockerfile`); one StatefulSet runs Postgres 16 with the `vervent_*` tables
(`../vervent/sql`); Traefik + cert-manager (already on the cluster) terminate TLS.

Stage 1 covers Vervent only. The Copart page in the SPA has no backend yet.

## Cluster access

kubectl from a new IP times out (security-group allowlist). Tunnel instead:

```sh
ssh -N -L 16443:127.0.0.1:6443 aws009.inmatics.io &
kubectl config view --minify --raw --context aws009 > /tmp/aws009.kubeconfig
kubectl --kubeconfig /tmp/aws009.kubeconfig config set-cluster "$(kubectl --kubeconfig /tmp/aws009.kubeconfig config view -o jsonpath='{.clusters[0].name}')" \
    --server=https://127.0.0.1:16443 --tls-server-name=kubernetes
export KUBECONFIG=/tmp/aws009.kubeconfig
```

## First-time setup

```sh
deploy/create-secrets.sh         # DB + sign-in secrets, ECR pull creds
deploy/push.sh 1.0.0             # build + push the image (pin matches k8s/kustomization.yaml)
kubectl apply -k deploy/k8s      # Postgres comes up; the app pod restarts until the schema exists
deploy/load-schema.sh            # vervent_* tables
deploy/load-vervent.sh           # every vervent/*_Daily_P50.csv
deploy/deploy.sh                 # waits for both pods
```

DNS is a CNAME from `camber.inmatics.io` to `aws009.inmatics.io`. The OAuth client in
`client_secret_*.json` lists `https://camber.inmatics.io/api/auth/google/callback`.

## Shipping a new build

`deploy/push.sh <new-tag>` (ECR tags are immutable), bump `newTag` in `k8s/kustomization.yaml`,
then run `deploy/deploy.sh`.

## Loading a Vervent drop

Vervent sends the files to the SFTP drop box; [`SFTP.md`](SFTP.md) covers what has arrived and
how to pull it.

Put the `YYYYMMDD_*_Daily_P50.csv` files in `vervent/` (gitignored: lessee personal data), then:

```sh
deploy/load-vervent.sh vervent/20261112_*_Daily_P50.csv
```

`vervent/load.py` takes the column mapping and date formats from the DDL comments in
`vervent/sql`, checks every header against them before sending anything, and loads each file in
one transaction. A header mismatch or a value that doesn't cast fails that file and stops the
run. Re-loading is safe. If a load fails because the extract changed, fix the DDL, apply the
change to the cluster by hand (`ALTER TABLE`, since the DDL is `IF NOT EXISTS`), and load again.

## Sign-in

Google OIDC, limited to verified `@cambercredit.com` addresses (`AUTH_ALLOWED_DOMAIN` in
`k8s/app.yaml`) plus whatever `AUTH_ALLOWED_EMAILS` lists in the `cambercredit-auth` Secret.
To change the list:

```sh
kubectl -n camber patch secret cambercredit-auth \
    -p "{\"stringData\":{\"AUTH_ALLOWED_EMAILS\":\"a@x.com,b@y.com\"}}"
kubectl -n camber rollout restart deployment/cambercredit
```

## Secrets

- `cambercredit-db` holds the Postgres password. It is generated once and must never be
  regenerated: the data directory on the node (`/srv/cambercredit-pgdata`) is initialized with it.
  The old app's data directory, `/srv/camber-pgdata`, is still on the node and nothing uses it.
- `cambercredit-auth` holds the OAuth client JSON, `SESSION_SECRET` and `AUTH_ALLOWED_EMAILS`.
  Deleting it and rerunning `create-secrets.sh` rotates the session key, which only signs everyone out.
