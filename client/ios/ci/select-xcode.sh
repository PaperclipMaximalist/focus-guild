#!/usr/bin/env bash
# Selects the newest stable Xcode 26 or later on a GitHub macOS runner.
# Apple only accepts App Store uploads built with Xcode 26 or later.
#
# XCODE_VERSION (optional): pin a version, for example "26.6". It must match
# /Applications/Xcode_<version>.app on the runner image.
# Betas and release candidates (Xcode_27.0_beta.app and so on) are never chosen,
# since App Store Connect refuses builds made with them.
#
# Writes DEVELOPER_DIR to $GITHUB_ENV and `version` to $GITHUB_OUTPUT.
set -euo pipefail

MIN_MAJOR=26

if [ -n "${XCODE_VERSION:-}" ]; then
  app="/Applications/Xcode_${XCODE_VERSION}.app"
  if [ ! -d "$app" ]; then
    echo "::error title=Pinned Xcode not found::XCODE_VERSION is ${XCODE_VERSION} but ${app} does not exist on this runner. Installed:"
    ls -d /Applications/Xcode*.app || true
    exit 1
  fi
else
  # Stable installs only: Xcode_26.6.app, Xcode_26.4.1.app, ...
  newest="$(
    ls -d /Applications/Xcode_*.app 2>/dev/null \
      | sed -n -E 's#^/Applications/Xcode_([0-9]+(\.[0-9]+)*)\.app$#\1#p' \
      | awk -F. -v min="$MIN_MAJOR" '$1 >= min' \
      | sort -t. -k1,1n -k2,2n -k3,3n \
      | tail -n 1
  )"
  if [ -z "$newest" ]; then
    echo "::error title=No Xcode ${MIN_MAJOR} or later::This runner has no stable Xcode ${MIN_MAJOR}+ in /Applications. Apple requires Xcode ${MIN_MAJOR} or later. Change runs-on in .github/workflows/ios.yml to a newer macOS image. Installed:"
    ls -d /Applications/Xcode*.app || true
    exit 1
  fi
  app="/Applications/Xcode_${newest}.app"
fi

sudo xcode-select --switch "${app}/Contents/Developer"
echo "DEVELOPER_DIR=${app}/Contents/Developer" >> "$GITHUB_ENV"

version="$(xcodebuild -version | head -n 1 | awk '{print $2}')"
build="$(xcodebuild -version | sed -n 's/^Build version //p')"
major="${version%%.*}"
if [ "$major" -lt "$MIN_MAJOR" ]; then
  echo "::error title=Xcode too old::Selected Xcode ${version}; Apple requires ${MIN_MAJOR} or later."
  exit 1
fi

echo "Selected ${app} (Xcode ${version}, build ${build})"
echo "version=${version} (${build})" >> "$GITHUB_OUTPUT"
xcodebuild -showsdks | grep -i ios || true
