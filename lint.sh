#!/usr/bin/env bash
# No linter is configured for this repo; this runs the checks CLAUDE.md
# documents as the way to verify changes: go vet/build for the backend,
# npm run build for the frontend.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> go vet (be)"
(cd "$root/be" && go vet ./...)

echo "==> go build (be)"
(cd "$root/be" && go build ./...)

echo "==> npm run build (fe/web/app)"
(cd "$root/fe/web/app" && npm run build)

echo "All checks passed."
