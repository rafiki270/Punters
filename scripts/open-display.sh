#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3000}"
HEALTH_URL="${URL%/}/api/health"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
SLEEP_SECS="${SLEEP_SECS:-2}"

log() {
  printf '[punters] %s\n' "$*" >&2
}

wait_for_server() {
  local attempt=1
  while (( attempt <= MAX_ATTEMPTS )); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log "Server is up at $HEALTH_URL"
      return 0
    fi
    log "Waiting for server... ($attempt/$MAX_ATTEMPTS)"
    sleep "$SLEEP_SECS"
    (( attempt++ ))
  done
  log "Server did not become ready at $HEALTH_URL"
  return 1
}

launch_macos() {
  if open -Ra "Google Chrome" >/dev/null 2>&1; then
    log "Launching Google Chrome ($URL)"
    open -a "Google Chrome" "$URL" >/dev/null 2>&1 &
    return 0
  fi
  log "Google Chrome not found, falling back to Safari"
  open -a "Safari" "$URL" >/dev/null 2>&1 &
}

launch_linux() {
  if command -v xdg-open >/dev/null 2>&1; then
    log "Launching default browser with xdg-open ($URL)"
    xdg-open "$URL" >/dev/null 2>&1 &
    return 0
  fi
  if command -v gio >/dev/null 2>&1; then
    log "Launching default browser with gio open ($URL)"
    gio open "$URL" >/dev/null 2>&1 &
    return 0
  fi
  log "No browser launcher (xdg-open/gio) found on PATH"
  return 1
}

if ! command -v curl >/dev/null 2>&1; then
  log "curl is required for open-display.sh"
  exit 1
fi

wait_for_server || true

case "$(uname -s)" in
  Darwin)
    launch_macos
    ;;
  Linux)
    launch_linux
    ;;
  *)
    log "Unsupported platform for browser launch: $(uname -s)"
    exit 1
    ;;
esac
