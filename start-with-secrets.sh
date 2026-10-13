#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${1:-}" == "--watch" ]]; then
  node build.js
  node build.js --watch &
  build_pid=$!
  PERSONAL_OS_DEV=1 node --watch scripts/launcher.mjs &
  server_pid=$!
  cleanup() { kill "$build_pid" "$server_pid" 2>/dev/null || true; }
  trap cleanup EXIT
  trap 'exit 0' INT TERM
  wait "$server_pid"
else
  exec node scripts/launcher.mjs
fi
