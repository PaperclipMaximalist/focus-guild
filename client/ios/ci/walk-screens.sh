#!/usr/bin/env bash
# Walks the demo build through every screen in screens.tsv, once per look, and
# screenshots each one. The demo web bundle is steered from outside: it polls
# public/demo-route.json in the app bundle and, once a new "n" has settled,
# prints "[demo] shown <n> <line> <path>" to the console.
#
#   walk-screens.sh <simulator-udid> <path/to/App.app> <bundle-id> <output-dir> [looks]
#
# <App.app> is the BUILT app and must already hold the demo web bundle in public/.
# [looks] is a space-separated list; default is all seven.
#
# Three ways to move the app to the next screen, chosen from what the first
# screen shows (nobody can watch a Mac here, so the script says what happened):
#   A in place   write the route file inside the installed bundle; the app notices.
#   B reinstall  the console works but in-place writes were ignored: write the file
#                into the built app, reinstall, relaunch, for every screen.
#   C blind      the console never said "[demo] ready": as B, but wait a fixed time.
#
# A slow or unconfirmed screen never fails the build; pictures are the point.
# Exit 0 when at least 90% of the screens have a screenshot file, otherwise 1.
#
# Overrides, used by walk-screens.selftest.sh:
#   SCREENS_FILE      the screens list (default: screens.tsv next to this script)
#   WALK_WAIT_SCALE   multiplies every wait for the console (default 1; may be 0.05)
#   WALK_BLIND_SLEEP  seconds to wait per screen in mode C (default 8)
#   SIM_NAME          printed in the summary when set
set -euo pipefail

udid="$1"
app="$2"
bundle_id="$3"
out="$4"
shift 4
# One quoted list or several words, both work.
looks="${*:-night deep dispatch orbital sleeper spire star}"

here="$(cd "$(dirname "$0")" && pwd)"
screens_file="${SCREENS_FILE:-$here/screens.tsv}"
scale="${WALK_WAIT_SCALE:-1}"
blind_sleep="${WALK_BLIND_SLEEP:-8}"

console_log="$out/demo-console.log"
results="$out/.walk-results.txt"
mkdir -p "$out/screens-png" "$out/screens" "$out/store"
: > "$console_log"
: > "$results"
touch "$out/.started"

launch_pid=""

collect_logs() {
  # The app's own log lines from the simulator, and any crash report.
  xcrun simctl spawn "$udid" log show --last 15m --style compact \
    --predicate "process == \"App\" OR subsystem == \"${bundle_id}\"" \
    > "$out/simulator-app.log" 2>&1 || true
  find "$HOME/Library/Logs/DiagnosticReports" -name 'App*' -newer "$out/.started" \
    -exec cp {} "$out/" \; 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [ -n "$launch_pid" ]; then kill "$launch_pid" 2>/dev/null || true; fi
  if [ "$status" -ne 0 ]; then collect_logs; fi
  rm -f "$out/.started"
  exit "$status"
}
trap cleanup EXIT

# --- helpers -----------------------------------------------------------------

# Starts the app with its console attached. simctl stays running in the
# background (that is what keeps the output coming); the previous one is stopped.
launch_app() {
  if [ -n "$launch_pid" ]; then
    kill "$launch_pid" 2>/dev/null || true
    wait "$launch_pid" 2>/dev/null || true
  fi
  xcrun simctl launch --console-pty --terminate-running-process "$udid" "$bundle_id" \
    >> "$console_log" 2>&1 &
  launch_pid=$!
}

# Writes the route file so the page never reads half of it: a temp file in the
# same folder, then a rename.
publish_route() { # <route file> <n> <path> <line> <timer: true|false>
  local f="$1" tmp
  tmp="$(dirname "$f")/.demo-route.$$.tmp"
  printf '{"n":%s,"path":"%s","line":"%s","timer":%s}\n' "$2" "$3" "$4" "$5" > "$tmp"
  mv -f "$tmp" "$f"
}

# Polls the console log for a fixed string, every 0.2 s, for up to <seconds> x scale.
# Sets wait_found (1/0), wait_line (the last matching line) and wait_secs.
wait_for() { # <fixed string> <seconds>
  local needle="$1" ticks i=0
  ticks="$(awk -v s="$2" -v k="$scale" 'BEGIN { t = int(s * k * 10); if (t < 2) t = 2; print t }')"
  wait_found=0
  wait_line=""
  while [ "$i" -lt "$ticks" ]; do
    if grep -F -q -- "$needle" "$console_log"; then
      wait_found=1
      wait_line="$(grep -F -- "$needle" "$console_log" | tail -n 1 || true)"
      break
    fi
    sleep 0.2
    i=$((i + 2))
  done
  wait_secs="$(awk -v i="$i" 'BEGIN { printf "%.1f", i / 10 }')"
}

# Mode B and C: the route goes into the built app, which is then reinstalled.
reinstall_show() {
  publish_route "$app/public/demo-route.json" "$n" "$path" "$look" "$timer"
  xcrun simctl terminate "$udid" "$bundle_id" 2>/dev/null || true
  xcrun simctl install "$udid" "$app" \
    || echo "::warning title=Reinstall failed::simctl install failed before screen $n; the screenshot may show the previous screen."
  launch_app
}

# Shows screen number n and sets wait_found, wait_line and wait_secs.
# The first call also decides the mode.
show_screen() {
  if [ -z "$mode" ]; then
    publish_route "$route_file" "$n" "$path" "$look" "$timer"
    wait_for "[demo] shown $n " 20
    if [ "$wait_found" -eq 1 ]; then
      mode=A
      mode_reason="the page answered a route file written inside the installed app, the fastest way"
      echo "::notice title=Screen walk mode::A, in place: ${mode_reason}."
      return
    fi
    mode=B
    mode_reason="the console works but the page did not answer a route file written inside the installed app within 20 s (x${scale}); each screen reinstalls and relaunches the app"
    echo "::notice title=Screen walk mode::B, reinstall: ${mode_reason}."
    n=$((n + 1))   # a fresh n, so the page cannot mistake it for the unanswered one
  fi
  case "$mode" in
    A)
      publish_route "$route_file" "$n" "$path" "$look" "$timer"
      wait_for "[demo] shown $n " 25
      ;;
    B)
      reinstall_show
      wait_for "[demo] shown $n " 40
      ;;
    C)
      reinstall_show
      sleep "$blind_sleep"
      wait_found=0
      wait_line=""
      wait_secs="$blind_sleep"
      ;;
  esac
}

# Is the app still a running process in the simulator? Two signs, either is
# enough, because neither has been seen on a Mac yet: simctl stays attached to
# the console for as long as the app runs, and launchd lists the app by its
# bundle id. (A case, not a pipe to grep -q: under pipefail an early-exiting
# grep can fail the pipeline.)
app_alive() {
  local list
  if [ -n "$launch_pid" ] && kill -0 "$launch_pid" 2>/dev/null; then return 0; fi
  list="$(xcrun simctl spawn "$udid" launchctl list 2>/dev/null || true)"
  case "$list" in
    *"$bundle_id"*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- 1. is this a demo build -------------------------------------------------

if [ ! -f "$app/public/demo-route.json" ]; then
  echo "::error title=Not a demo build::${app}/public/demo-route.json is missing; the demo web bundle (npm run build:demo) was not copied into the app."
  exit 1
fi
if [ ! -f "$screens_file" ]; then
  echo "::error title=No screens list::${screens_file} does not exist."
  exit 1
fi

# The screens, read once. Tab separated: stem, path, optional "timer".
stems=(); paths=(); timers=()
while IFS= read -r row || [ -n "$row" ]; do
  row="${row%$'\r'}"
  case "$row" in ''|'#'*) continue ;; esac
  s_timer=""
  IFS=$'\t' read -r s_stem s_path s_timer <<< "$row"
  stems+=("$s_stem"); paths+=("$s_path")
  if [ "$s_timer" = "timer" ]; then timers+=(true); else timers+=(false); fi
done < "$screens_file"
count=${#stems[@]}
if [ "$count" -eq 0 ]; then
  echo "::error title=No screens::${screens_file} lists no screens."
  exit 1
fi

# --- 2. simulator ready, app installed ---------------------------------------

echo "Booting ${udid}"
xcrun simctl boot "$udid" 2>/dev/null || true   # already booted is fine
xcrun simctl bootstatus "$udid" -b
# A tidy status bar for the screenshots; cosmetic, so failures are ignored.
xcrun simctl status_bar "$udid" override --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 2>/dev/null || true
xcrun simctl terminate "$udid" "$bundle_id" 2>/dev/null || true
echo "Installing ${app}"
xcrun simctl install "$udid" "$app"

# --- 3. launch with the console attached -------------------------------------

echo "Launching ${bundle_id} with its console attached"
launch_app
installed="$(xcrun simctl get_app_container "$udid" "$bundle_id" app)"
route_file="$installed/public/demo-route.json"
echo "Installed app: ${installed}"

# --- 4. does the console work ------------------------------------------------

wait_for "[demo] ready" 60
console_works=$wait_found
if [ "$console_works" -eq 1 ]; then
  echo "The page said it is ready after ${wait_secs} s."
else
  echo "::warning title=No console::The page did not print [demo] ready within 60 s (x${scale}). Walking blind."
fi

# --- 5/6. the walk -----------------------------------------------------------

mode=""
mode_reason=""
if [ "$console_works" -eq 0 ]; then
  mode=C
  mode_reason="[demo] ready never arrived, so the console cannot be trusted; each screen reinstalls the app and waits ${blind_sleep} s"
  echo "::notice title=Screen walk mode::C, blind: ${mode_reason}."
fi

n=0
total=0; n_ok=0; n_unconfirmed=0; n_missing=0; n_with_file=0

for look in $looks; do
  mkdir -p "$out/screens-png/$look"
  i=0
  while [ "$i" -lt "$count" ]; do
    stem="${stems[$i]}"; path="${paths[$i]}"; timer="${timers[$i]}"
    i=$((i + 1))
    total=$((total + 1))
    n=$((n + 1))

    show_screen
    png="$out/screens-png/$look/$stem.png"
    xcrun simctl io "$udid" screenshot --type=png "$png" 2>/dev/null || true

    note=""
    if [ "$mode" = "C" ]; then
      note="blind wait"
    elif [ "$wait_found" -eq 0 ]; then
      note="no acknowledgement in time"
    else
      case "$wait_line" in *"(still loading)"*) note="still loading" ;; esac
    fi

    died=0
    if ! app_alive; then
      died=1
      note="${note:+$note; }app was not running, relaunched"
      echo "::warning title=App not running::${bundle_id} was gone after ${look}/${stem}; relaunching."
      launch_app
    fi

    if [ ! -s "$png" ]; then
      status=missing
      n_missing=$((n_missing + 1))
    else
      n_with_file=$((n_with_file + 1))
      if [ -z "$note" ] && [ "$died" -eq 0 ]; then
        status=ok
        n_ok=$((n_ok + 1))
      else
        status=unconfirmed
        n_unconfirmed=$((n_unconfirmed + 1))
      fi
    fi
    printf '%-11s %-9s %-16s %-24s %5ss  %s\n' "$status" "$look" "$stem" "$path" "$wait_secs" "$note" >> "$results"
    echo "${status}: ${look}/${stem} (${wait_secs} s)${note:+ - $note}"
  done
done

# --- 7. small copies for review, and the store pictures ----------------------

for png in "$out"/screens-png/*/*.png; do
  [ -f "$png" ] || continue
  look="$(basename "$(dirname "$png")")"
  stem="$(basename "$png" .png)"
  mkdir -p "$out/screens/$look"
  sips -s format jpeg -s formatOptions 72 -Z 1400 "$png" --out "$out/screens/$look/$stem.jpg" >/dev/null 2>&1 \
    || echo "::warning title=sips failed::Could not make a small copy of ${look}/${stem}."
done

store_copy() { # <look> <stem> <store name>
  local src="$out/screens-png/$1/$2.png"
  if [ -s "$src" ]; then cp "$src" "$out/store/$3"; fi
}
store_copy night 01-today 01_today.png
store_copy night 02-route 02_route.png
store_copy night 03-quests 03_quests.png
store_copy night 08-expeditions 04_expeditions.png
store_copy night 07-trophies 05_trophies.png
store_copy star 01-today 06_star_guild.png
store_copy night 17-timer 07_timer.png

# --- 8. summary --------------------------------------------------------------

{
  echo "Screen walk"
  echo "Mode: ${mode} (${mode_reason})"
  if [ -n "${SIM_NAME:-}" ]; then echo "Simulator: ${SIM_NAME}"; fi
  echo "Looks: ${looks}"
  echo "Console worked: $([ "$console_works" -eq 1 ] && echo yes || echo no)"
  echo
  printf '%-11s %-9s %-16s %-24s %6s  %s\n' status look stem path waited note
  cat "$results"
  echo
  echo "Totals: ${total} screens, ${n_ok} ok, ${n_unconfirmed} unconfirmed, ${n_missing} missing"
  echo
  echo "Console lines saying a route went unanswered:"
  unanswered="$(grep -F '[demo] unanswered' "$console_log" | sort -u || true)"
  if [ -n "$unanswered" ]; then printf '%s\n' "$unanswered"; else echo "(none)"; fi
} > "$out/walk-summary.txt"
rm -f "$results"
cat "$out/walk-summary.txt"

extra=""
if [ "$n_missing" -gt 0 ]; then extra=", ${n_missing} missing"; fi
echo "::notice title=Screen walk::${total} screens, ${n_unconfirmed} unconfirmed${extra}"

# --- 9. verdict --------------------------------------------------------------

if [ $((n_with_file * 100)) -lt $((total * 90)) ]; then
  echo "::error title=Too few screenshots::Only ${n_with_file} of ${total} screens produced a picture (at least 90% are needed). See walk-summary.txt and demo-console.log."
  exit 1
fi
