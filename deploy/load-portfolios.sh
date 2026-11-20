#!/usr/bin/env bash
# Load Camber's lease list (which leases are Camber's, and the portfolio of each) into the
# in-cluster Postgres with portfolio/load.py.
#
#   deploy/load-portfolios.sh                                   # the list in portfolio/
#   deploy/load-portfolios.sh path/to/another-list.xlsx
#
# The list replaces the one loaded before, in one transaction: leases missing from it lose their
# portfolio. Re-loading the same list changes nothing. Needs openpyxl locally. Run it after
# deploy/load-schema.sh and before loading Vervent files: the loader's daily snapshot holds the
# leases on the list.
set -euo pipefail

cd "$(dirname "$0")/.."

NS=camber
PSQL="kubectl -n $NS exec -i postgres-0 -- psql -U cambercredit -d cambercredit" \
    python3 portfolio/load.py "${1:-portfolio/Camber Credit - Lease IDs & Portfolios.xlsx}"
