#!/usr/bin/env bash
# Screenshot the running dev server (`npm run dev`) with headless Chrome/Chromium.
# Usage: scripts/screenshot.sh [layer=surface] [zoom=1] [out=build/debug/<layer>-<zoom>.png] [size=1600,1050]
# Output goes under build/ (gitignored) so agents with working-directory-only read access can view it.
set -euo pipefail
LAYER=${1:-surface}
ZOOM=${2:-1}
OUT=${3:-build/debug/${LAYER}-${ZOOM}.png}
SIZE=${4:-1600,1050}
URL=${STRATUM_URL:-http://127.0.0.1:5173}

for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "$(command -v google-chrome || true)" "$(command -v chromium || true)" "$(command -v chromium-browser || true)"; do
  if [[ -n "$c" && -x "$c" ]]; then CHROME=$c; break; fi
done
[[ -n "${CHROME:-}" ]] || { echo "no Chrome/Chromium found" >&2; exit 1; }
curl -sf -o /dev/null "$URL/" || { echo "dev server not reachable at $URL (run: npm run dev)" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$SIZE" \
  --virtual-time-budget=8000 --screenshot="$OUT" "$URL/?layer=$LAYER&zoom=$ZOOM" 2>/dev/null
echo "$OUT"
