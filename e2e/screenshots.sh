#!/usr/bin/env bash
# Captures App Store screenshots on the dedicated Sfragis simulators.
#   e2e/screenshots.sh
# Writes store/screenshots/iphone-6.9/ and store/screenshots/ipad-13/.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

udid_for() {
  xcrun simctl list devices -j | python3 -c '
import json, sys
for runtime in json.load(sys.stdin)["devices"].values():
    for d in runtime:
        if d["name"] == sys.argv[1]:
            print(d["udid"]); sys.exit()
sys.exit("no simulator named " + sys.argv[1])' "$1"
}

export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
if [[ -z "${JAVA_HOME:-}" ]] && command -v brew >/dev/null; then
  for jdk in openjdk@21 openjdk; do
    candidate="$(brew --prefix "$jdk" 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
    [[ -x "$candidate/bin/java" ]] && export JAVA_HOME="$candidate" && break
  done
fi

capture() {
  local name="$1" folder="$2" udid
  udid="$(udid_for "$name")"
  xcrun simctl ui "$udid" content_size large
  xcrun simctl status_bar "$udid" override --time "9:41" \
    --batteryState discharging --batteryLevel 100 \
    --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 --dataNetwork wifi
  local work; work="$(mktemp -d)"
  maestro --device "$udid" test \
    -e CONTACT_1="$(cat fixtures/eleni-papadaki.asc)" \
    -e CONTACT_2="$(cat fixtures/nikos-karras.asc)" \
    -e CONTACT_3="$(cat fixtures/yannis-dimou.asc)" \
    --test-output-dir "$work" store/demo-and-capture.yaml
  local out="$ROOT/store/screenshots/$folder"
  mkdir -p "$out"
  find "$work" -path "*takeScreenshot*" -name "0*.png" -exec cp {} "$out/" \;
  # The app blocks the iOS screenshot API while plaintext is shown, so these two
  # come straight from the Simulator framebuffer.
  xcrun simctl io "$udid" screenshot --type=png "$out/04-decrypt.png" >/dev/null
  maestro --device "$udid" test --test-output-dir "$work" store/show-qr.yaml
  xcrun simctl io "$udid" screenshot --type=png "$out/05-qr.png" >/dev/null
  xcrun simctl status_bar "$udid" clear
  rm -rf "$work"
  for f in "$ROOT/store/screenshots/$folder"/*.png; do
    printf '%s  %s\n' "$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{printf "%s ", $2}')" "${f#$ROOT/}"
  done
}

capture "Sfragis iPhone" iphone-6.9
capture "Sfragis iPad" ipad-13
