#!/usr/bin/env bash
# Bundles the test suite through the app's real Metro and Babel configuration and
# runs it on a bare Hermes VM. Set HERMES_BIN to a Hermes shell built from the tag
# in node_modules/react-native/sdks/.hermesv1version. Pass --rsa to include RSA 4096.
set -euo pipefail
: "${HERMES_BIN:?Set HERMES_BIN to the path of a Hermes VM binary}"
OUT="$(mktemp -d)"
SFRAGIS_HARNESS=1 npx expo export:embed --entry-file tests/hermes-entry.ts --platform ios --dev false \
  --minify false --reset-cache --bundle-output "$OUT/suite.js" --assets-dest "$OUT/assets"
FLAG=false; [[ "${1:-}" == "--rsa" ]] && FLAG=true
{ echo "var SFRAGIS_RSA = $FLAG;"; cat "$OUT/suite.js"; } > "$OUT/run.js"
"$HERMES_BIN" -O "$OUT/run.js"
