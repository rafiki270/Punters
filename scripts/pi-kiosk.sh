#!/usr/bin/env bash
# Launch Punters server and open Chromium in kiosk mode on Raspberry Pi.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Start the server in the background
npm start &
SERVER_PID=$!

# Ensure we kill server on exit
cleanup() {
  kill $SERVER_PID
}
trap cleanup EXIT

# Wait for server to be ready
until curl -sSf http://localhost:3000/api/health >/dev/null; do
  sleep 1
done

# Prepare display (disable screen blanking)
export DISPLAY=${DISPLAY:-:0}
xset s off
xset -dpms
xset s noblank

# Launch Chromium in kiosk mode (enable remote debugging)
chromium-browser \
  --kiosk http://localhost:3000 \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --check-for-update-interval=1 \
  --remote-debugging-port=9222
