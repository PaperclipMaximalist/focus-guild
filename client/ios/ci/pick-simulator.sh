#!/usr/bin/env bash
# Picks an available iPhone simulator on the newest installed iOS runtime.
# Prefers the 6.9-inch "Pro Max" (the screenshot size App Store Connect asks for).
# Writes SIM_UDID and SIM_NAME to $GITHUB_ENV.
set -euo pipefail

json="$(xcrun simctl list devices available --json)"

choice="$(
  printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
      const devices = JSON.parse(s).devices;
      const ver = k => (k.match(/iOS-(\d+)-(\d+)(?:-(\d+))?$/) || []).slice(1).map(n => +(n || 0));
      const runtimes = Object.keys(devices).filter(k => /SimRuntime\.iOS-/.test(k))
        .sort((a, b) => { const x = ver(a), y = ver(b); return (y[0]-x[0]) || (y[1]-x[1]) || (y[2]-x[2]); });
      for (const rt of runtimes) {
        const phones = devices[rt].filter(d => d.isAvailable !== false && /^iPhone/.test(d.name));
        if (!phones.length) continue;
        const pick = phones.find(d => /Pro Max$/.test(d.name)) || phones.find(d => /Pro$/.test(d.name)) || phones[0];
        console.log([pick.udid, pick.name, rt.replace(/.*SimRuntime\./, "")].join("\t"));
        return;
      }
      process.exit(1);
    });'
)" || {
  echo "::error title=No iPhone simulator::No available iPhone simulator on this runner."
  xcrun simctl list devices available
  exit 1
}

IFS=$'\t' read -r udid name runtime <<< "$choice"
echo "Simulator: ${name} (${runtime}) ${udid}"
{
  echo "SIM_UDID=${udid}"
  echo "SIM_NAME=${name} (${runtime})"
} >> "$GITHUB_ENV"
