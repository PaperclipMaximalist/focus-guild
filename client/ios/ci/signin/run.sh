#!/usr/bin/env bash
# The iOS sign-in check: one real sign-in in the iPhone simulator against a
# throwaway server and a website on the same machine. Used by
# .github/workflows/ios-signin.yml, one subcommand per workflow step.
#
#   run.sh install-maestro              download the pinned Maestro, check its checksum, put it on PATH
#   run.sh build-website                production web build (dev auth, API on 127.0.0.1) into $WEB_DIST
#   run.sh start-services               throwaway database, API, website; waits until each answers
#   run.sh boot-and-install <udid> <App.app>
#   run.sh run-flow <udid>              Maestro drives flow.yaml; its exit code is kept for the summary
#   run.sh check-server                 GET /devices and the request log; writes signin-summary.txt
#   run.sh collect <udid>               everything for the ci-signin branch, into $EVIDENCE
#   run.sh stop-services
#
# The server-side subcommands (build-website, start-services, check-server,
# stop-services) also run on Windows (Git Bash) and Linux, so the same file
# can be tried without a Mac: set DB_PORT, API_PORT, WEB_PORT and WORK.
#
# Nothing here is secret: the server runs in dev auth (no CLERK_SECRET_KEY,
# every request is the dev member) on an in-memory database. Still, no
# environment is ever printed.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$here/../../../.." && pwd)"

DB_PORT="${DB_PORT:-54329}"
API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-5173}"
BUNDLE_ID="${BUNDLE_ID:-com.focusguild.app}"
MAESTRO_VERSION="${MAESTRO_VERSION:-2.12.1}"
# The app is built with client/.env.ios-ci, which names 3000 and 5173: the
# simulator shares the Mac's network, so 127.0.0.1 inside it is this machine.
API="http://127.0.0.1:${API_PORT}"
WEB="http://127.0.0.1:${WEB_PORT}"
WORK="${WORK:-${RUNNER_TEMP:-/tmp}/signin}"
WEB_DIST="${WEB_DIST:-$WORK/website}"
EVIDENCE="${EVIDENCE:-$WORK/evidence}"
MAESTRO_OUT="$WORK/maestro"
mkdir -p "$WORK" "$EVIDENCE"

note() { echo "::notice title=$1::$2"; }
err() { echo "::error title=$1::$2"; }

# Node wants a native path on Windows (Git Bash paths are /c/...); elsewhere unchanged.
native_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# The PID listening on a TCP port (to stop exactly what this script started).
pid_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1
  else
    # Windows: "TCP 127.0.0.1:3151 0.0.0.0:0 LISTENING 1234"
    netstat -ano 2>/dev/null | awk -v p=":$port" '$1 == "TCP" && $4 == "LISTENING" && substr($2, length($2) - length(p) + 1) == p { print $5; exit }'
  fi
}

stop_port() {
  local port="$1" pid
  pid="$(pid_on_port "$port")"
  [ -n "$pid" ] || return 0
  echo "Stopping PID ${pid} (port ${port})"
  if command -v taskkill >/dev/null 2>&1 && ! command -v lsof >/dev/null 2>&1; then
    taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
}

# Waits until a URL answers at all (any HTTP status), up to $2 seconds.
wait_for_url() {
  local url="$1" secs="$2" i
  for ((i = 0; i < secs; i++)); do
    if curl -s -o /dev/null --max-time 2 "$url"; then return 0; fi
    sleep 1
  done
  return 1
}

cmd_install_maestro() {
  # The release zip itself, checked against the release's own checksum file,
  # rather than the install script (which fetches whatever it is told to).
  local dir="$WORK/maestro-cli" base="https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${MAESTRO_VERSION}"
  mkdir -p "$dir"
  curl -fsSL --retry 3 -o "$dir/maestro.zip" "$base/maestro.zip" || { err "Maestro download failed" "Could not download ${base}/maestro.zip"; return 1; }
  curl -fsSL --retry 3 -o "$dir/checksums_sha256.txt" "$base/checksums_sha256.txt" || { err "Maestro download failed" "Could not download the checksum file"; return 1; }
  local want got
  want="$(awk '/maestro\.zip/ { print $1; exit }' "$dir/checksums_sha256.txt")"
  got="$(shasum -a 256 "$dir/maestro.zip" | awk '{ print $1 }')"
  if [ -z "$want" ] || [ "$want" != "$got" ]; then
    err "Maestro checksum mismatch" "maestro.zip ${MAESTRO_VERSION}: expected ${want:-none}, got ${got}"
    return 1
  fi
  unzip -q -o "$dir/maestro.zip" -d "$dir"
  local bin
  bin="$(dirname "$(find "$dir" -type f -path '*/bin/maestro' | head -n 1)")"
  [ -x "$bin/maestro" ] || { err "Maestro not found" "No bin/maestro inside maestro.zip"; return 1; }
  [ -n "${GITHUB_PATH:-}" ] && echo "$bin" >> "$GITHUB_PATH"
  local v
  v="$("$bin/maestro" --version 2>/dev/null | tail -n 1)"
  echo "Maestro ${v} at ${bin}"
  [ "$v" = "$MAESTRO_VERSION" ] || { err "Wrong Maestro version" "Asked for ${MAESTRO_VERSION}, got '${v}'"; return 1; }
}

cmd_build_website() {
  # The website as it would be deployed, but in dev auth: no Clerk key, so
  # main.tsx mounts the app without Clerk and every request is the dev member.
  # Built into its own folder because the app build writes client/dist.
  cd "$ROOT/client" || return 1
  env -u VITE_CLERK_PUBLISHABLE_KEY VITE_API_URL="$API" \
    npx vite build --outDir "$(native_path "$WEB_DIST")" --emptyOutDir
}

cmd_start_services() {
  local logs="$EVIDENCE"
  if [ -f "$ROOT/server/.env" ] || [ -f "$ROOT/server/.env.local" ]; then
    err "server/.env present" "Refusing to start: the server would read real settings from it. This check runs only on a throwaway database."
    return 1
  fi

  echo "Starting the throwaway database on ${DB_PORT}"
  (cd "$ROOT/ci/throwaway" && nohup node db.mjs "$(native_path "$ROOT/server/prisma/migrations")" "$DB_PORT" \
    < /dev/null > "$logs/database.log" 2>&1 &)
  local i
  for ((i = 0; i < 90; i++)); do
    grep -q 'pglite ready' "$logs/database.log" 2>/dev/null && break
    sleep 1
  done
  grep -q 'pglite ready' "$logs/database.log" || { err "Database did not start" "No 'pglite ready' within 90 s. See database.log on ci-signin."; tail -n 30 "$logs/database.log"; return 1; }
  echo "Database ready ($(grep -c '^applied' "$logs/database.log") migrations)"

  echo "Starting the API on ${API_PORT} (dev auth)"
  local preload
  preload="$(node -e 'console.log(require("node:url").pathToFileURL(process.argv[1]).href)' "$(native_path "$ROOT/ci/throwaway/preload.mjs")")"
  # env -u: whatever the runner has, the server must not see a Clerk key or a
  # real database URL, and must hand the code back by the focusguild:// scheme
  # (a Universal Link cannot work on 127.0.0.1; server lib/universalLink.ts).
  (cd "$ROOT/server" && nohup env -u CLERK_SECRET_KEY -u DATABASE_URL -u APP_LINK_RETURN -u APPLE_TEAM_ID \
    LOCAL_PG_URL="postgresql://postgres@127.0.0.1:${DB_PORT}/postgres" \
    PORT="$API_PORT" CLIENT_URL="$WEB" \
    npx tsx --import "$preload" src/index.ts < /dev/null > "$logs/server.log" 2>&1 &)
  if ! wait_for_url "$API/health" 120; then
    err "API did not start" "Nothing answered ${API}/health within 120 s. See server.log on ci-signin."
    tail -n 40 "$logs/server.log"
    return 1
  fi
  echo "API answers: $(curl -s --max-time 5 "$API/health")"

  echo "Starting the website preview on ${WEB_PORT}"
  [ -f "$WEB_DIST/index.html" ] || { err "No website build" "${WEB_DIST}/index.html is missing; run build-website first."; return 1; }
  (cd "$ROOT/client" && nohup npx vite preview --port "$WEB_PORT" --strictPort --host 127.0.0.1 \
    --outDir "$(native_path "$WEB_DIST")" < /dev/null > "$logs/website.log" 2>&1 &)
  if ! wait_for_url "$WEB/app-link" 60; then
    err "Website did not start" "Nothing answered ${WEB} within 60 s. See website.log on ci-signin."
    tail -n 40 "$logs/website.log"
    return 1
  fi
  # The page the browser sheet opens must be the app's page, not a 404.
  if ! curl -s --max-time 5 "$WEB/app-link?challenge=x&state=y" | grep -q '<div id="root">'; then
    err "Website serves the wrong page" "${WEB}/app-link did not return the app's index.html."
    return 1
  fi
  echo "Website answers at ${WEB}"
}

cmd_boot_and_install() {
  local udid="$1" app="$2"
  xcrun simctl boot "$udid" 2>/dev/null || true   # already booted is fine
  xcrun simctl bootstatus "$udid" -b || { err "Simulator did not boot" "simctl bootstatus failed for ${udid}"; return 1; }
  xcrun simctl status_bar "$udid" override --time "9:41" --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3 2>/dev/null || true
  # Keeps the time window the app log is read from (collect).
  touch "$WORK/.started"
  xcrun simctl install "$udid" "$app" || { err "Install failed" "simctl install of ${app} failed"; return 1; }
  echo "Installed ${BUNDLE_ID} on ${udid}"
}

cmd_run_flow() {
  local udid="$1" status
  mkdir -p "$MAESTRO_OUT"
  export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
  # No timeout(1) on macOS: the workflow step's timeout-minutes is the ceiling for a hang.
  maestro --device="$udid" test \
    --test-output-dir="$MAESTRO_OUT" \
    --debug-output="$MAESTRO_OUT/debug" \
    --no-ansi \
    "$here/flow.yaml" 2>&1 | tee "$WORK/maestro-console.log"
  status=${PIPESTATUS[0]}
  echo "$status" > "$WORK/flow-exit-code"
  if [ "$status" -eq 0 ]; then
    note "Maestro flow passed" "Sign in, Connect, signed in, and still signed in after a relaunch."
  else
    err "Maestro flow failed" "maestro exited ${status}. Screenshots and maestro-console.log are on the ci-signin branch; the last screenshot shows where it stopped."
  fi
  return "$status"
}

cmd_check_server() {
  local summary="$EVIDENCE/signin-summary.txt" flow devices_json count link token ok=1
  if [ -f "$WORK/flow-exit-code" ]; then
    flow="$(cat "$WORK/flow-exit-code")"
    [ "$flow" = "0" ] && flow="passed" || { flow="failed (maestro exit ${flow})"; ok=0; }
  else
    flow="did not run"
    ok=0
  fi

  # As the dev member, the one the website signed in as.
  devices_json="$(curl -s --max-time 10 -H "X-Dev-Clerk-Id: dev-member-001" "$API/devices")"
  printf '%s\n' "$devices_json" > "$EVIDENCE/devices.json"
  count="$(printf '%s' "$devices_json" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const j = JSON.parse(s); console.log(j.success && Array.isArray(j.data) ? j.data.length : "unreadable"); }
      catch { console.log("unreadable"); }
    });')"
  [ "$count" = "1" ] || ok=0

  # requestLog.ts: "--> POST /devices/link?tz=-480 201 12ms" (the client adds ?tz= to every call).
  link="$(grep -E -m 1 '^--> POST /devices/link(\?[^ ]*)? 2[0-9]{2} ' "$EVIDENCE/server.log" 2>/dev/null)"
  token="$(grep -E -m 1 '^--> POST /devices/token(\?[^ ]*)? 2[0-9]{2} ' "$EVIDENCE/server.log" 2>/dev/null)"
  [ -n "$link" ] || ok=0
  [ -n "$token" ] || ok=0

  {
    echo "iOS sign-in check, source commit ${GITHUB_SHA:-local}"
    echo "Flow (Maestro, client/ios/ci/signin/flow.yaml): ${flow}"
    echo "Devices listed for dev-member-001 by GET /devices: ${count} (expected 1; response in devices.json)"
    echo "Server log, POST /devices/link with 2xx (the website asked for a one-time code): ${link:-NOT FOUND}"
    echo "Server log, POST /devices/token with 2xx (the app traded the code for a token): ${token:-NOT FOUND}"
    echo "All /devices lines in the server log:"
    grep -E '^--> [A-Z]+ /devices' "$EVIDENCE/server.log" 2>/dev/null | sed 's/^/  /' || true
    # Tells "the app or the sheet never reached the API" (0) apart from "it did, and the sign-in went wrong".
    echo "Requests answered other than /health and this check's GET /devices: $(grep -E '^--> ' "$EVIDENCE/server.log" 2>/dev/null | grep -v -E '^--> GET /health|^--> GET /devices 200' | grep -c . || true)"
    echo "The last 15 answered requests (not /health):"
    grep -E '^--> ' "$EVIDENCE/server.log" 2>/dev/null | grep -v '^--> GET /health' | tail -n 15 | sed 's/^/  /' || true
    if [ "$ok" = 1 ]; then echo "Verdict: PASS"; else echo "Verdict: FAIL"; fi
  } > "$summary"
  cat "$summary"

  local one_line="flow ${flow}; devices listed ${count}; link $([ -n "$link" ] && echo found || echo missing); token $([ -n "$token" ] && echo found || echo missing)"
  if [ "$ok" = 1 ]; then
    note "Sign-in verified" "$one_line"
  else
    err "Sign-in not verified" "$one_line. See signin-summary.txt on ci-signin."
    return 1
  fi
}

cmd_collect() {
  local udid="${1:-}"
  mkdir -p "$EVIDENCE/screens"
  if [ -n "$udid" ]; then
    xcrun simctl io "$udid" screenshot --type=png "$WORK/simulator-end.png" 2>/dev/null || true
    # The app's log, as smoke-test.sh's collect_logs reads it, plus the
    # browser sheet's process, which is where the focusguild:// hand-off starts.
    xcrun simctl spawn "$udid" log show --last 30m --style compact \
      --predicate "process == \"App\" OR subsystem == \"${BUNDLE_ID}\" OR process == \"SafariViewService\"" \
      > "$EVIDENCE/simulator-app.log" 2>&1 || true
    if [ "$(( $(wc -l < "$EVIDENCE/simulator-app.log") ))" -gt 3000 ]; then
      tail -n 3000 "$EVIDENCE/simulator-app.log" > "$EVIDENCE/simulator-app.log.tmp" && mv "$EVIDENCE/simulator-app.log.tmp" "$EVIDENCE/simulator-app.log"
    fi
    if [ -f "$WORK/.started" ]; then
      find "$HOME/Library/Logs/DiagnosticReports" -name 'App*' -newer "$WORK/.started" \
        -exec cp {} "$EVIDENCE/" \; 2>/dev/null || true
    fi
  fi

  # Every PNG Maestro wrote (the five named stages and any failure shot), and
  # the final simulator shot, as JPEG at most 1400 px on the long side.
  local f name
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    name="$(basename "$f" .png | sed 's/[^A-Za-z0-9._-]/_/g')"
    if command -v sips >/dev/null 2>&1; then
      sips -s format jpeg -s formatOptions 80 -Z 1400 "$f" --out "$EVIDENCE/screens/${name}.jpg" >/dev/null 2>&1 \
        || cp "$f" "$EVIDENCE/screens/${name}.png"
    else
      cp "$f" "$EVIDENCE/screens/${name}.png"
    fi
  done < <( { find "$MAESTRO_OUT" -type f -name '*.png' 2>/dev/null; [ -f "$WORK/simulator-end.png" ] && echo "$WORK/simulator-end.png"; } | sort)

  # Maestro's own output, the last 400 lines of each.
  [ -f "$WORK/maestro-console.log" ] && tail -n 400 "$WORK/maestro-console.log" > "$EVIDENCE/maestro-console.log"
  local mlog
  mlog="$(find "$MAESTRO_OUT" -type f -name 'maestro.log' 2>/dev/null | head -n 1)"
  [ -n "$mlog" ] && tail -n 400 "$mlog" > "$EVIDENCE/maestro.log"
  [ -f "$EVIDENCE/signin-summary.txt" ] || echo "check-server did not run (an earlier step failed or was cancelled)." > "$EVIDENCE/signin-summary.txt"

  cat > "$EVIDENCE/README.md" <<EOF
# ci-signin

One real sign-in of the Focus Guild iPhone app in the simulator, driven by
Maestro ${MAESTRO_VERSION}, against a throwaway server and website on the same
Mac runner. Made by .github/workflows/ios-signin.yml; overwritten on every run
and safe to delete.

- Source commit: ${GITHUB_SHA:-local}
- Simulator: ${SIM_NAME:-unknown} ${udid}
- Xcode: ${XCODE:-unknown}
- Run: ${RUN_URL:-local}

Files
- signin-summary.txt: what was observed, line by line, and the verdict.
- screens/01-sign-in.jpg: the app's sign-in screen after a clean launch.
- screens/02-browser-sheet.jpg: the website's Connect page in the browser sheet.
- screens/03-after-connect.jpg: just after pressing Connect this iPhone (and Open, if iOS asked).
- screens/04-signed-in.jpg: the signed-in app (Today, welcome guide, tab bar).
- screens/05-relaunched.jpg: after stopping and relaunching without clearing state (the Keychain kept the session).
- screens/simulator-end.jpg: the simulator's screen when the job finished, whatever happened.
- screens/ (any other file): Maestro's own screenshot of a failing step.
- devices.json: GET /devices as the dev member after the flow (one device expected).
- server.log: the API's output, including its request log (lines starting --> are answers).
- website.log: the vite preview server's output.
- database.log: the throwaway database's output (migrations applied).
- maestro-console.log: Maestro's console output (last 400 lines).
- maestro.log: Maestro's debug log (last 400 lines), if it wrote one.
- simulator-app.log: the app's and the browser sheet's log lines from the simulator.
- App*.ips: crash reports, if the app crashed.
EOF
  echo "Evidence in ${EVIDENCE}:"
  ls -la "$EVIDENCE" "$EVIDENCE/screens"
}

cmd_stop_services() {
  stop_port "$WEB_PORT"
  stop_port "$API_PORT"
  stop_port "$DB_PORT"
}

sub="${1:-}"
shift || true
case "$sub" in
  install-maestro) cmd_install_maestro ;;
  build-website) cmd_build_website ;;
  start-services) cmd_start_services ;;
  boot-and-install) cmd_boot_and_install "$@" ;;
  run-flow) cmd_run_flow "$@" ;;
  check-server) cmd_check_server ;;
  collect) cmd_collect "$@" ;;
  stop-services) cmd_stop_services ;;
  *) echo "usage: run.sh install-maestro|build-website|start-services|boot-and-install|run-flow|check-server|collect|stop-services" >&2; exit 2 ;;
esac
