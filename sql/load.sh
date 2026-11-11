#!/usr/bin/env bash
# Load Vervent report CSVs and Copart Sales & Inventory xlsx reports into the
# vervent / copart schemas.
#
#   sql/load.sh pipeline/data/inbox/2026-10-20            # every *.csv / *.xlsx in the folder
#   sql/load.sh "path/20261019_Contract Summary_P50.csv"  # one file
#   sql/load.sh path/Camber_Sales_Inventory_Report_20261030051005.xlsx
#
# Env: CAMBER_DB (default camber), PSQL (default psql), PGHOST/PGPORT/PGUSER as
# usual for psql. Report type and cadence come from the filename
# (AssetSummary / Contract Summary / TransactionHistory, _Daily_ / _Monthly_),
# the as-of date from its YYYYMMDD_ prefix (fallback: a YYYY-MM-DD parent
# folder, with a warning). The header line must match the one recorded in the
# matching load_<type>.sql, so a changed extract fails before touching the DB.
# Each file loads in one transaction; reloading a filename replaces its rows.
#
# A Copart xlsx is first split by copart_to_csv.py into <YYYYMMDD>_CopartInventory.csv
# and <YYYYMMDD>_CopartSales.csv (as-of from the timestamp in the xlsx name),
# which then load like any other report via load_copart_<tab>.sql.
set -euo pipefail

cd "$(dirname "$0")/.."
SQL_DIR=sql
DB="${CAMBER_DB:-camber}"
PSQL="${PSQL:-psql}"
PYTHON="${PYTHON:-python3}"

if [ $# -eq 0 ]; then
    echo "usage: $0 <csv/xlsx file or directory>..." >&2
    exit 2
fi

files=()
for arg in "$@"; do
    if [ -d "$arg" ]; then
        while IFS= read -r f; do files+=("$f"); done \
            < <(find "$arg" -maxdepth 1 -type f \( -iname '*.csv' -o -iname '*.xlsx' \) | sort)
    else
        files+=("$arg")
    fi
done

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

detect_type() {
    local n
    n=$(basename "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')
    case "$n" in
        *copartinventory*)     echo copart_inventory ;;
        *copartsales*)         echo copart_sales ;;
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

# load_one <file> [<source xlsx basename> <sha256 of the xlsx>]
load_one() {
    local f=$1 source=${2:-} sha=${3:-}
    local type asof cadence load_sql expected actual rows
    type=$(detect_type "$f")
    if [ -z "$type" ]; then
        echo "skip (unknown report type): $f" >&2
        return 0
    fi
    asof=$(detect_asof "$f")
    if [ -z "$asof" ]; then
        echo "error: cannot determine as-of date for $f" >&2
        return 1
    fi
    cadence=$(detect_cadence "$f")
    load_sql="$SQL_DIR/load_$type.sql"

    expected=$(grep -m1 '^-- HEADER: ' "$load_sql" | sed 's/^-- HEADER: //')
    actual=$(head -n 1 "$f" | tr -d '\r' | sed 's/^\xEF\xBB\xBF//')
    # "/" and a space are equivalent: since the 2026-11-10 drop Vervent exports
    # "OUTSTANDING A R" for "OUTSTANDING A/R".
    if [ "${expected//\// }" != "${actual//\// }" ]; then
        echo "error: header of $f does not match $load_sql" >&2
        diff <(tr '|' '\n' <<<"$expected") <(tr '|' '\n' <<<"$actual") >&2 || true
        return 1
    fi

    [ -n "$sha" ] || sha=$(shasum -a 256 "$f" | cut -d' ' -f1)
    rows=$(( $(grep -c '' "$f") - 1 ))

    echo "== $type ($asof${cadence:+, $cadence}, $rows rows): $(basename "$f")${source:+ <- $source}"
    "$PSQL" -d "$DB" -q -v ON_ERROR_STOP=1 \
        -v filename="$(basename "$f")" -v asof="$asof" \
        -v cadence="$cadence" -v source="$source" -v sha="$sha" -v rows="$rows" \
        -f "$load_sql" < "$f"
}

for f in "${files[@]}"; do
    case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in
        *.xlsx)
            if [[ "$(basename "$f" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z')" != *salesinventory* ]]; then
                echo "skip (not a Copart Sales & Inventory report): $f" >&2
                continue
            fi
            asof_arg=()
            dir=$(basename "$(dirname "$f")")
            [[ "$dir" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && asof_arg=(--asof "$dir")
            # the filename's own date wins inside copart_to_csv.py; --asof is the folder fallback
            mapfile -t parts < <("$PYTHON" "$SQL_DIR/copart_to_csv.py" "$f" "$tmpdir" "${asof_arg[@]}")
            if [ "${#parts[@]}" -ne 2 ]; then
                echo "error: could not convert $f" >&2
                status=1
                continue
            fi
            xsha=$(shasum -a 256 "$f" | cut -d' ' -f1)
            for p in "${parts[@]}"; do
                load_one "$p" "$(basename "$f")" "$xsha" || status=1
            done
            ;;
        *)
            load_one "$f" || status=1
            ;;
    esac
done
exit $status
