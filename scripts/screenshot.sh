#!/usr/bin/env bash
# Screenshot the running dev server (`npm run dev`) with headless Chrome/Chromium, via scripts/shot.mjs.
# Usage: scripts/screenshot.sh [layer=surface] [zoom=1] [out=build/debug/<layer>-<zoom>.png] [size=1600x1050]
#   MOBILE=1       phone emulation (use with size 390x844)
#   QUERY='&select=<id>&atlas=1'   extra URL parameters
#   SCHEME=light|dark              force the colour scheme
#   STRATUM_URL=http://127.0.0.1:5180   another dev server
# Output goes under build/ (gitignored) so agents with working-directory-only read access can view it.
set -euo pipefail
LAYER=${1:-surface}
ZOOM=${2:-1}
OUT=${3:-build/debug/${LAYER}-${ZOOM}.png}
SIZE=${4:-1600x1050}
SIZE=${SIZE/,/x} # the old WxH form was W,H
URL=${STRATUM_URL:-http://127.0.0.1:5173}

curl -sf -o /dev/null "$URL/" || { echo "dev server not reachable at $URL (run: npm run dev)" >&2; exit 1; }

ARGS=(--size "$SIZE")
[[ "${MOBILE:-}" == 1 ]] && ARGS+=(--mobile)
[[ -n "${SCHEME:-}" ]] && ARGS+=(--scheme "$SCHEME")
cd "$(dirname "$0")/.."
node scripts/shot.mjs "$URL/?layer=$LAYER&zoom=$ZOOM${QUERY:-}" "$OUT" "${ARGS[@]}"
