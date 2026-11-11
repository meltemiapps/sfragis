#!/usr/bin/env bash
# Runs the Maestro flows on a dedicated Simulator.
#   e2e/run.sh <simulator-udid-or-name> [flow.yaml ...]
# Defaults to every flow in e2e/flows. Results and screenshots go to e2e/output/<device>/.
set -euo pipefail
cd "$(dirname "$0")"

DEVICE="${1:?usage: e2e/run.sh <simulator-udid-or-name> [flows...]}"
shift || true
UDID=$(xcrun simctl list devices -j | python3 -c '
import json, sys
want = sys.argv[1]
for runtime in json.load(sys.stdin)["devices"].values():
    for d in runtime:
        if d["udid"] == want or d["name"] == want:
            print(d["udid"]); sys.exit()
sys.exit("no simulator named " + want)' "$DEVICE")
NAME=$(xcrun simctl list devices | sed -n "s/^ *\(.*\) ($UDID).*/\1/p" | tr ' ' '-')

case "$NAME" in
  iPhone-17|iPad-Pro-13-inch-\(M5\)) echo "Refusing to run on $NAME: reserved for another session." >&2; exit 2 ;;
esac

export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
if [[ -z "${JAVA_HOME:-}" ]] && command -v brew >/dev/null; then
  for jdk in openjdk@21 openjdk; do
    candidate="$(brew --prefix "$jdk" 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
    [[ -x "$candidate/bin/java" ]] && export JAVA_HOME="$candidate" && break
  done
fi

OUT="output/$NAME"
mkdir -p "$OUT"
FLOWS=("$@")
[[ ${#FLOWS[@]} -eq 0 ]] && FLOWS=(flows)

status=0
maestro --device "$UDID" test \
  -e CONTACT_KEY="$(cat fixtures/nikos-karras.asc)" \
  --format junit --output "$OUT/report.xml" \
  --test-output-dir "$OUT/artifacts" \
  "${FLOWS[@]}" || status=$?

# Self-test timings are logged by flows/a-self-test.yaml.
grep -h "JsConsole: SELFTEST_RESULT" "$OUT"/artifacts/*/*/logs/maestro.log 2>/dev/null | tail -1 | sed 's/.*SELFTEST_RESULT /Self-test: /' || true
exit "$status"
