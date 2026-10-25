#!/usr/bin/env bash
set -euo pipefail
# All MCP listeners stay inside this container; exactly one gateway owns state.
mkdir -p "${PAA_MEMORY_ROOT:?}" "${PAA_SECRETS_HOME:?}"
pids=()
cleanup() {
  trap - EXIT INT TERM
  if (( ${#pids[@]} )); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
for spec in memory:8911 auth:8912 project:8913; do
  SERVER_KIND="${spec%:*}" HOST=127.0.0.1 PORT="${spec#*:}" MEMORY_ROOT="$PAA_MEMORY_ROOT" \
    VERSION="${HACKATHON_SOURCE_SHA:?}" node /app/mcp_release/dist/src/index.js &
  pids+=("$!")
done
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if node /usr/local/lib/ryadom/healthcheck.mjs --mcp-only; then ready=true; break; fi
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null || { echo 'MCP process exited during startup' >&2; exit 1; }
  done
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'MCP startup timed out' >&2; exit 1; fi
node dist/gateway/server.js &
pids+=("$!")
# Stop the whole unit when any required child stops; do not leave an orphan gateway.
set +e
wait -n "${pids[@]}"
status=$?
set -e
if (( status == 0 )); then status=1; fi
exit "$status"
