#!/usr/bin/env bash
# Runs xcodebuild with a readable log in the job output and the raw log on disk.
#
#   run-xcodebuild.sh <raw-log-file> <xcodebuild arguments...>
#
# The raw log is kept whole (upload it as an artifact). The console gets
# xcbeautify's summary when the runner has it; errors are annotated either way,
# and on failure the last lines and every "error:" line of the raw log are printed.
set -uo pipefail

log="$1"
shift
mkdir -p "$(dirname "$log")"

if command -v xcbeautify >/dev/null 2>&1; then
  xcodebuild "$@" 2>&1 | tee "$log" | xcbeautify --renderer github-actions
else
  xcodebuild "$@" 2>&1 | tee "$log" | grep -E --line-buffered 'error:|warning: |\*\* [A-Z ]+ (SUCCEEDED|FAILED) \*\*|^(Resolve|Fetching|Compiling|Linking|Signing|Exporting|Upload)'
fi
status=${PIPESTATUS[0]}

if [ "$status" -ne 0 ]; then
  echo "::group::xcodebuild failed (exit ${status}): every error line"
  grep -n -E 'error:|\*\* .* FAILED \*\*' "$log" | head -n 80 || true
  echo "::endgroup::"
  echo "::group::Last 150 lines of the raw log"
  tail -n 150 "$log"
  echo "::endgroup::"
  echo "::error title=xcodebuild failed::exit ${status}. The full log is in the job's artifacts (${log##*/})."
fi
exit "$status"
