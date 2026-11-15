#!/usr/bin/env bash
# Tests walk-screens.sh on any machine with bash, with no simulator: a fake
# xcrun and a fake sips are put first on PATH. Three cases, one per mode.
#
#   bash client/ios/ci/walk-screens.selftest.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fakebin="$root/bin"
mkdir -p "$fakebin"

# The fake xcrun. Only "simctl" is understood. FAKE_MODE says how the pretend
# app behaves: A (watches the installed route file), B (answers only the route
# present at launch), C (prints nothing). FAKE_ROOT holds the pretend simulator.
cat > "$fakebin/xcrun" <<'FAKE'
#!/usr/bin/env bash
shift                       # "simctl"
sub="$1"; shift
installed="$FAKE_ROOT/installed/App.app"
route="$installed/public/demo-route.json"
field() { sed -n "s/.*\"$1\": *\"\{0,1\}\([^\",}]*\).*/\1/p" "$route"; }
case "$sub" in
  boot|bootstatus|status_bar|terminate) exit 0 ;;
  install)    # <udid> <app>: replace the installed copy
    rm -rf "$FAKE_ROOT/installed"; mkdir -p "$FAKE_ROOT/installed"
    cp -R "$2" "$installed" ;;
  get_app_container) echo "$installed" ;;
  io)         # <udid> screenshot --type=png <file>: a tiny fake picture
    for last in "$@"; do :; done
    echo "fake png" > "$last" ;;
  spawn)      # launchctl list says the app runs; log show prints a line
    if [ "$2" = "launchctl" ]; then echo "123 0 UIKitApplication:com.focusguild.app[abcd]"; else echo "fake log"; fi ;;
  launch)     # stays attached like --console-pty, until killed
    case "$FAKE_MODE" in
      A)
        echo "[log] - [demo] ready"
        last=""
        while :; do
          cur="$(field n)"
          if [ "$cur" != "$last" ]; then
            last="$cur"
            echo "[log] - [demo] shown $cur $(field line) $(field path)"
          fi
          sleep 0.1
        done ;;
      B)
        echo "[log] - [demo] ready"
        echo "[log] - [demo] shown $(field n) $(field line) $(field path)"
        while :; do sleep 0.2; done ;;
      *)
        while :; do sleep 0.2; done ;;
    esac ;;
esac
FAKE

# The fake sips: "sips ... <in> --out <out>" copies the file.
cat > "$fakebin/sips" <<'FAKE'
#!/usr/bin/env bash
prev=""; in=""
for a in "$@"; do
  if [ "$prev" = "--out" ]; then cp "$in" "$a"; exit 0; fi
  if [ "$a" != "--out" ]; then in="$a"; fi
  prev="$a"
done
exit 1
FAKE
chmod +x "$fakebin/xcrun" "$fakebin/sips"

# Three screens; the store copies come from 01-today, 02-route and 17-timer.
printf '# test list\n01-today\t/\n\n02-route\t/feed\n17-timer\t/\ttimer\n' > "$root/screens.tsv"

fails=0
case_failed=0
check() { # <description> <exit status of the test: 0 = true>
  if [ "$2" -eq 0 ]; then echo "    ok   $1"; else echo "    FAIL $1"; case_failed=1; fi
}

run_case() { # <name> <fake mode> <expected mode> <expected ok> <expected unconfirmed>
  local name="$1" fmode="$2" want_mode="$3" want_ok="$4" want_unc="$5"
  local dir="$root/$name" out="$root/$name/out" rc
  case_failed=0
  mkdir -p "$dir/built/App.app/public"
  echo '{"n":0,"path":"/","line":"night","timer":false}' > "$dir/built/App.app/public/demo-route.json"
  echo "case ${name}: fake ${fmode}, expecting mode ${want_mode}"
  PATH="$fakebin:$PATH" FAKE_MODE="$fmode" FAKE_ROOT="$dir/sim" \
    SCREENS_FILE="$root/screens.tsv" WALK_WAIT_SCALE=0.05 WALK_BLIND_SLEEP=0.3 SIM_NAME="Fake iPhone" \
    bash "$here/walk-screens.sh" FAKE-UDID "$dir/built/App.app" com.focusguild.app "$out" night star \
    > "$dir/stdout.txt" 2>&1
  rc=$?
  check "exit code 0" "$rc"
  grep -q "^Mode: ${want_mode} " "$out/walk-summary.txt"; check "summary says mode ${want_mode}" $?
  grep -q "title=Screen walk mode::${want_mode}," "$dir/stdout.txt"; check "mode notice printed" $?
  [ "$(find "$out/screens-png" -name '*.png' | wc -l | tr -d ' ')" = 6 ]; check "6 full-size screenshots" $?
  [ "$(find "$out/screens" -name '*.jpg' | wc -l | tr -d ' ')" = 6 ]; check "6 small copies" $?
  [ "$(ls "$out/store" | tr '\n' ' ')" = "01_today.png 02_route.png 06_star_guild.png 07_timer.png " ]; check "store copies named right" $?
  grep -q "^Totals: 6 screens, ${want_ok} ok, ${want_unc} unconfirmed, 0 missing" "$out/walk-summary.txt"; check "totals: ${want_ok} ok, ${want_unc} unconfirmed" $?
  grep -q "Simulator: Fake iPhone" "$out/walk-summary.txt"; check "simulator name in summary" $?
  grep -q "title=Screen walk::6 screens, ${want_unc} unconfirmed" "$dir/stdout.txt"; check "totals notice printed" $?
  if [ "$case_failed" -eq 0 ]; then
    echo "PASS ${name}"
  else
    echo "FAIL ${name}"; tail -n 30 "$dir/stdout.txt" | sed 's/^/      | /'; fails=$((fails + 1))
  fi
}

run_case a-in-place A A 6 0
run_case b-reinstall B B 6 0
run_case c-blind C C 0 6

# A built app without the demo route file must be refused.
mkdir -p "$root/plain/App.app/public"
plain_out="$(PATH="$fakebin:$PATH" FAKE_MODE=A FAKE_ROOT="$root/plain/sim" bash "$here/walk-screens.sh" U "$root/plain/App.app" b "$root/plain/out" 2>&1)"
if printf "%s" "$plain_out" | grep -q "title=Not a demo build"; then
  echo "PASS d-not-a-demo-build"
else
  echo "FAIL d-not-a-demo-build"; fails=$((fails + 1))
fi

if [ "$fails" -eq 0 ]; then echo "All passed."; else echo "${fails} case(s) failed."; exit 1; fi
