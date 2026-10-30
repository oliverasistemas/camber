# NALN sFTP drop

NALN uploads one combined PDF per funded loan (they can't split it into one
PDF per Funding Checklist document — Kim Feely, 2026-10-29). The drop is a
third user, `naln`, on the existing SFTP server on aws009, next to `vervent`
and `westlake`. Set up 2026-10-30.

## Connection details (for NALN)

| | |
|---|---|
| Host | `aws009.inmatics.io` (18.207.57.97) |
| Port | `2222` |
| User | `naln` |
| Password | given to NALN out of band; not stored in this repo |
| Host key (ED25519) | `SHA256:7XpoHYA00JUC1hoLcL5mE4auYwKJofICzVBYh8KaYPE` |
| Upload to | `upload/` |

```sh
sftp -P 2222 naln@aws009.inmatics.io
sftp> cd upload
sftp> put <loan>.pdf
```

## Where it lives

The server is not in this repo. It is defined in the inmatics repo
(`~/inmatics`):

- `deployments/k8s/sftp/sftp.yaml`: atmoz/sftp, namespace `sftp`, hostPort
  2222 on the QA node. The security group `sg-0e503859bf7cfe87c` already allows
  tcp/2222 from anywhere.
- `deployments/create-sftp-secrets.sh`: users (`naln` is uid 1003) and host
  keys.
- `deployments/k8s/sftp/processor.yaml`: a CronJob that runs every 15 minutes.

On the node, files land in `/srv/sftp/naln/upload/`. The processor moves any
file older than 60s to `/srv/sftp/naln/processed/<YYYY-MM-DD>/`. It only
moves files: nothing ingests the PDFs into camber yet.

## Rotate the password / switch to a key

```sh
cd ~/inmatics
deployments/create-sftp-secrets.sh naln                     # new password, printed once
deployments/create-sftp-secrets.sh naln path/to/naln_key.pub   # also enables key auth
```

The script keeps the other users and the host keys, and restarts the pod,
which costs Vervent and Westlake a few seconds of downtime.

## Gotchas

- atmoz/sftp prints `users.conf`, plaintext passwords included, to the pod log
  at every start, so anyone with `kubectl logs` on the `sftp` namespace can
  read every user's password. Key auth avoids depending on that.
- To test a password login non-interactively, `sftp -b` needs
  `-o BatchMode=no`, otherwise it fails with `Permission denied`.
