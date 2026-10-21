#!/usr/bin/env bash
# Load Vervent daily/monthly report CSVs into the vervent schema.
#
#   sql/load.sh pipeline/data/inbox/2026-10-20            # every *.csv in the folder
#   sql/load.sh "path/20261019_Contract Summary_P50.csv"  # one file
#
# Env: CAMBER_DB (default camber), PSQL (default psql), PGHOST/PGPORT/PGUSER as
# usual for psql. Report type and cadence come from the filename
# (AssetSummary / Contract Summary / TransactionHistory, _Daily_ / _Monthly_),
# the as-of date from its YYYYMMDD_ prefix (fallback: a YYYY-MM-DD parent
# folder, with a warning). The header line must match the one recorded in the
# matching load_<type>.sql, so a changed extract fails before touching the DB.
# Each file loads in one transaction; reloading a filename replaces its rows.
set -euo pipefail

cd "$(dirname "$0")/.."
SQL_DIR=sql
DB="${CAMBER_DB:-camber}"
PSQL="${PSQL:-psql}"

if [ $# -eq 0 ]; then
    echo "usage: $0 <csv file or directory>..." >&2
    exit 2
fi

files=()
for arg in "$@"; do
    if [ -d "$arg" ]; then
        while IFS= read -r f; do files+=("$f"); done < <(find "$arg" -maxdepth 1 -type f -iname '*.csv' | sort)
    else
        files+=("$arg")
    fi
done

detect_type() {
    local n
    n=$(basename "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')
    case "$n" in
        *assetsummary*)        echo asset_summary ;;
        *contractsummary*)     echo contract_summary ;;
        *transactionhist*)     echo transaction_history ;;
        *)                     echo "" ;;
    esac
}

detect_cadence() {
    local n
    n=$(basename "$1" | tr '[:upper:]' '[:lower:]')
    case "$n" in
        *daily*)   echo daily ;;
        *monthly*) echo monthly ;;
        *)         echo "" ;;
    esac
}

detect_asof() {
    local base dir
    base=$(basename "$1")
    if [[ "$base" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})_ ]]; then
        echo "${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
        return
    fi
    dir=$(basename "$(dirname "$1")")
    if [[ "$dir" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
        echo "warning: $base has no YYYYMMDD_ prefix; using folder date $dir" >&2
        echo "$dir"
        return
    fi
    echo ""
}

status=0
for f in "${files[@]}"; do
    type=$(detect_type "$f")
    if [ -z "$type" ]; then
        echo "skip (unknown report type): $f" >&2
        continue
    fi
    asof=$(detect_asof "$f")
    if [ -z "$asof" ]; then
        echo "error: cannot determine as-of date for $f" >&2
        status=1
        continue
    fi
    cadence=$(detect_cadence "$f")
    load_sql="$SQL_DIR/load_$type.sql"

    expected=$(grep -m1 '^-- HEADER: ' "$load_sql" | sed 's/^-- HEADER: //')
    actual=$(head -n 1 "$f" | tr -d '\r' | sed 's/^\xEF\xBB\xBF//')
    if [ "$expected" != "$actual" ]; then
        echo "error: header of $f does not match $load_sql" >&2
        diff <(tr '|' '\n' <<<"$expected") <(tr '|' '\n' <<<"$actual") >&2 || true
        status=1
        continue
    fi

    sha=$(shasum -a 256 "$f" | cut -d' ' -f1)
    rows=$(( $(grep -c '' "$f") - 1 ))

    echo "== $type ($asof${cadence:+, $cadence}, $rows rows): $(basename "$f")"
    "$PSQL" -d "$DB" -q -v ON_ERROR_STOP=1 \
        -v filename="$(basename "$f")" -v asof="$asof" \
        -v cadence="$cadence" -v sha="$sha" -v rows="$rows" \
        -f "$load_sql" < "$f"
done
exit $status
