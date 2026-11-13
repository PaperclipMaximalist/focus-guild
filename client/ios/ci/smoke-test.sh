#!/usr/bin/env bash
# Proves the simulator build starts: boot, install, launch, then check the app's
# process is still alive at ~10 s and ~20 s, with a screenshot at each point.
# A crash on launch (or within 20 s) fails the step.
#
#   smoke-test.sh <simulator-udid> <path/to/App.app> <bundle-id> <output-dir>
set -euo pipefail

udid="$1"
app="$2"
bundle_id="$3"
out="$4"
mkdir -p "$out"

collect_logs() {
  # The app's own log lines from the simulator, and any crash report.
  xcrun simctl spawn "$udid" log show --last 5m --style compact \
    --predicate "process == \"App\" OR subsystem == \"${bundle_id}\"" \
    > "$out/simulator-app.log" 2>&1 || true
  find "$HOME/Library/Logs/DiagnosticReports" -name 'App*' -newer "$out/.started" \
    -exec cp {} "$out/" \; 2>/dev/null || true
}

fail() {
  echo "::error title=App did not stay running::$1"
  collect_logs
  exit 1
}

touch "$out/.started"

echo "Booting ${udid}"
xcrun simctl boot "$udid" 2>/dev/null || true   # already booted is fine
xcrun simctl bootstatus "$udid" -b
# A tidy status bar for the screenshots; cosmetic, so failures are ignored.
xcrun simctl status_bar "$udid" override --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 2>/dev/null || true

echo "Installing ${app}"
xcrun simctl install "$udid" "$app"

echo "Launching ${bundle_id}"
launch_out="$(xcrun simctl launch "$udid" "$bundle_id")" || fail "simctl launch failed: ${launch_out:-no output}"
echo "$launch_out"
# Output looks like "com.focusguild.app: 12345". Simulator apps are host processes.
pid="${launch_out##*: }"
case "$pid" in
  ''|*[!0-9]*) fail "Could not read a process id from: ${launch_out}" ;;
esac

alive() { kill -0 "$pid" 2>/dev/null; }

sleep 10
xcrun simctl io "$udid" screenshot --type=png "$out/after-10s.png" || true
alive || fail "The app (pid ${pid}) exited within 10 seconds of launch. See simulator-app.log and any App*.ips crash report in the artifacts."

sleep 10
xcrun simctl io "$udid" screenshot --type=png "$out/after-20s.png" || true
alive || fail "The app (pid ${pid}) exited between 10 and 20 seconds after launch. See simulator-app.log and any App*.ips crash report in the artifacts."

echo "The app is still running 20 seconds after launch (pid ${pid})."
collect_logs
rm -f "$out/.started"
