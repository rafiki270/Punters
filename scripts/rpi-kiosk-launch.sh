#!/usr/bin/env bash
# Launcher for Punters kiosk. Reads /etc/default/punters-kiosk for MODE and CLIENT_URL.
set -euo pipefail

CONFIG_FILE=${CONFIG_FILE:-/etc/default/punters-kiosk}

# Defaults
MODE=server
CLIENT_URL=""
INSTALL_DIR=/opt/punters

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

echo "Punters kiosk starting in MODE=${MODE}"

# Pick Chromium binary
BROWSER_BIN=""
if command -v chromium-browser >/dev/null 2>&1; then
  BROWSER_BIN=$(command -v chromium-browser)
elif command -v chromium >/dev/null 2>&1; then
  BROWSER_BIN=$(command -v chromium)
else
  echo "Chromium not found. Please install 'chromium-browser' or 'chromium'." >&2
  exit 1
fi

# Ensure DISPLAY and unblank screen
export DISPLAY=${DISPLAY:-:0}
export XAUTHORITY=${XAUTHORITY:-/home/${SUDO_USER:-${USER}}/.Xauthority}

# If xset is available, disable power management/blanking
if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

# Hide mouse cursor after idle
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

wait_for_http() {
  local url=$1
  local max=${2:-60}
  local n=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    n=$((n+1))
    if (( n >= max )); then
      echo "Timed out waiting for $url" >&2
      return 1
    fi
    sleep 1
  done
}

start_server() {
  cd "$INSTALL_DIR"
  echo "Working dir: $(pwd)"
  # Install deps if needed
  if [[ ! -d node_modules ]]; then
    echo "Installing dependencies..."
    (command -v npm >/dev/null 2>&1 && npm ci) || npm install
  fi
  # Build if needed
  if [[ ! -f dist/server.js ]]; then
    echo "Building project..."
    npm run build
  fi
  echo "Starting server..."
  # Force server to bind on port 80
  export PORT=80
  npm start &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  echo "Waiting for healthcheck..."
  wait_for_http "http://localhost:80/api/health" 90 || true
}

launch_browser() {
  local url=$1
  echo "Launching Chromium -> $url"
  exec "$BROWSER_BIN" \
    --kiosk \
    --incognito \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --check-for-update-interval=31536000 \
    --overscroll-history-navigation=0 \
    "$url"
}

case "$MODE" in
  server)
    start_server
    launch_browser "http://localhost"
    ;;
  client)
    if [[ -z "${CLIENT_URL}" ]]; then
      echo "CLIENT_URL not set in $CONFIG_FILE for client mode." >&2
      exit 1
    fi
    # Wait for network DNS (optional, best-effort)
    if command -v raspi-config >/dev/null 2>&1; then
      : # nothing
    fi
    # Give network a moment
    sleep 2
    launch_browser "$CLIENT_URL"
    ;;
  *)
    echo "Unknown MODE: $MODE (expected 'server' or 'client')" >&2
    exit 1
    ;;
esac
