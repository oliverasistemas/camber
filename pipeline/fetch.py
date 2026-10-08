"""Step 1: fetch Vervent servicer reports from their sFTP into data/inbox/<asof>/.

Uses the system `sftp` client (no Python SFTP dependency). Configure via
environment variables:

  VERVENT_SFTP_HOST        required, e.g. sftp.vervent.com
  VERVENT_SFTP_USER        required
  VERVENT_SFTP_PORT        default 22
  VERVENT_SFTP_KEY         path to a private key (optional; otherwise the
                           ssh agent / default keys are used)
  VERVENT_SFTP_REMOTE_DIR  remote directory to pull from, default '.'
  VERVENT_SFTP_GLOB        remote filename glob, default '*'

Until credentials are provisioned, drop files into data/inbox/<asof>/ by hand
(or run extract_workbook.py to replay a month from Brad's workbook) and skip
this step.
"""

import os
import subprocess
import sys

from common import DATA


def fetch(asof):
    host = os.environ.get("VERVENT_SFTP_HOST")
    user = os.environ.get("VERVENT_SFTP_USER")
    if not host or not user:
        sys.exit(
            "VERVENT_SFTP_HOST / VERVENT_SFTP_USER not set.\n"
            "Set the sFTP environment variables (see pipeline/fetch.py), or place "
            f"the report files in {DATA / 'inbox' / asof}/ manually."
        )
    port = os.environ.get("VERVENT_SFTP_PORT", "22")
    key = os.environ.get("VERVENT_SFTP_KEY")
    remote_dir = os.environ.get("VERVENT_SFTP_REMOTE_DIR", ".")
    glob = os.environ.get("VERVENT_SFTP_GLOB", "*")

    dest = DATA / "inbox" / asof
    dest.mkdir(parents=True, exist_ok=True)

    batch = f"cd {remote_dir}\nlcd {dest}\nmget {glob}\nbye\n"
    cmd = ["sftp", "-P", port]
    if key:
        cmd += ["-i", key]
    cmd += ["-b", "-", f"{user}@{host}"]
    print(f"fetching {remote_dir}/{glob} from {host} -> {dest}")
    r = subprocess.run(cmd, input=batch, text=True)
    if r.returncode != 0:
        sys.exit(f"sftp exited with {r.returncode}")
    files = sorted(p.name for p in dest.iterdir() if p.is_file())
    print(f"inbox now holds {len(files)} file(s):")
    for f in files:
        print(f"  {f}")
