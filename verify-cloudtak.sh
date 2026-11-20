#!/usr/bin/env bash
# Builds this plugin inside a fresh CloudTAK checkout exactly as the image build does,
# then runs the plugin's smoke test against real public data.
#
#   bash verify-cloudtak.sh [cloudtak-ref]           # fresh clone of dfpc-coe/CloudTAK (default: main)
#   CT_DIR=/path/to/CloudTAK bash verify-cloudtak.sh  # reuse an existing checkout with node_modules
set -euo pipefail

PLUGIN=$(cd "$(dirname "$0")" && pwd)
DEST="terrain-data-downloader"
REF="${1:-main}"

if [ -n "${CT_DIR:-}" ]; then
  CT="$CT_DIR"
else
  WORK=$(mktemp -d); CT="$WORK/CloudTAK"
  git clone -q --depth 1 --branch "$REF" https://github.com/dfpc-coe/CloudTAK "$CT"
fi
echo "CloudTAK v$(node -p "require('$CT/package.json').version") @ $(git -C "$CT" rev-parse --short HEAD) ($(git -C "$CT" log -1 --format=%cs))"

# Web half: exactly what TAK Portal copies (plugin/ layout)
rm -rf "$CT/app/plugins/$DEST"
mkdir -p "$CT/app/plugins/$DEST"
cp -a "$PLUGIN/plugin/." "$CT/app/plugins/$DEST/"

# API half: server/*.ts -> api/stateless/routes/
cp "$PLUGIN"/server/*.ts "$CT/api/stateless/routes/"

cd "$CT/app"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run lint
npm run check
npm run build

cd "$CT/api"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run lint
npx tsc

cd "$PLUGIN"
node test/smoke.mjs "$CT" "$(mktemp -d)"

echo "PASS: plugin builds against CloudTAK $(node -p "require('$CT/package.json').version") and the data pipeline verifies"
