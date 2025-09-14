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

# Ensure DISPLAY and session env
export DISPLAY=${DISPLAY:-:0}
export XAUTHORITY=${XAUTHORITY:-/home/${SUDO_USER:-${USER}}/.Xauthority}
if [[ -z "${XDG_RUNTIME_DIR:-}" && -n "${UID:-}" ]]; then
  export XDG_RUNTIME_DIR="/run/user/${UID}"
fi

# If xset is available, disable power management/blanking
if command -v xset >/dev/null 2>&1; then
  # Wait briefly for X to be ready
  for i in {1..60}; do
    xset q >/dev/null 2>&1 && break || true
    sleep 1
  done
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

# Simple ASCII overlay in X while Chromium launches
show_overlay() {
  if ! command -v xterm >/dev/null 2>&1; then
    return
  fi
  local LOG_DIR="$HOME/.local/share/punters"
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  local overlay_script="$LOG_DIR/overlay.sh"
  cat >"$overlay_script" <<'EOS'
#!/usr/bin/env bash
trap 'exit 0' TERM INT
tput civis || true
msg=${1:-"Launching browser..."}
i=0
width=40
while :; do
  bar=""
  fill=$(( i % (width+1) ))
  for ((j=0; j<width; j++)); do
    if (( j < fill )); then bar+="#"; else bar+="-"; fi
  done
  clear
  echo
  echo "  $msg"
  echo
  echo "  [$bar]"
  sleep 0.08
  ((i++))
done
EOS
  chmod +x "$overlay_script"
  xterm -fullscreen -fa 'Monospace' -fs 18 -bg black -fg white -e "$overlay_script" "Launching browser..." &
  OVERLAY_PID=$!
}

hide_overlay() {
  if [[ -n "${OVERLAY_PID:-}" ]]; then
    kill "$OVERLAY_PID" 2>/dev/null || true
    unset OVERLAY_PID
  fi
}

# Display handling: prefer native 4K with 2x scaling, else 1080p scaled to fill
if command -v xrandr >/dev/null 2>&1; then
  primary_output=$(xrandr --query 2>/dev/null | awk '/ connected primary/{print $1; exit} / connected/{print $1; exit}')
  if [[ -n "${primary_output:-}" ]]; then
    # Detect native/preferred mode (first mode line with a *)
    pref_line=$(xrandr --query 2>/dev/null | awk -v out="$primary_output" 'f && /\*/{print; exit} $1==out{f=1}')
    native_w=$(awk '{print $1}' <<<"$pref_line" | cut -dx -f1)
    native_h=$(awk '{print $1}' <<<"$pref_line" | cut -dx -f2)
    # Optional override to force 1080p pipeline
    FORCE_1080P=${FORCE_1080P:-0}
    if [[ -n "$native_w" && "$native_w" -ge 3000 && "$FORCE_1080P" != "1" ]]; then
      # 4K panel: keep native mode, use Chromium 2x scaling for crisp UI
      export BROWSER_FLAGS="${BROWSER_FLAGS:-} --high-dpi-support=1 --force-device-scale-factor=2"
      # Ensure output is at native preferred mode (best-effort)
      xrandr --output "$primary_output" --mode "${native_w}x${native_h}" >/dev/null 2>&1 || true
    else
      # 1080p path: set 1920x1080 and scale to fill native if available
      xrandr --output "$primary_output" --mode 1920x1080 --rate 60 >/dev/null 2>&1 || true
      if [[ -n "$native_w" && -n "$native_h" && "$native_w" -ge 2000 ]]; then
        # Scale 1080p up to panel native to avoid top-left quadrant/panning
        xrandr --output "$primary_output" --scale-from "${native_w}x${native_h}" >/dev/null 2>&1 || true
      fi
    fi
  fi
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
  # Logging setup
  local LOG_DIR="$HOME/.local/share/punters"
  local LOG_FILE="$LOG_DIR/kiosk.log"
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  echo "[punters] Launching Chromium -> $url at $(date)" >> "$LOG_FILE"
  # Start overlay while we spin up the browser
  show_overlay
  # Choose flags based on display stack
  local flags=(
    --kiosk
    --incognito
    --noerrdialogs
    --disable-infobars
    --disable-session-crashed-bubble
    --check-for-update-interval=31536000
    --no-first-run
    --password-store=basic
    --overscroll-history-navigation=0
  )
  # If running under Wayland, enable Ozone/Wayland. Otherwise stick to X11 defaults.
  if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    flags+=(--enable-features=UseOzonePlatform --ozone-platform=wayland)
  fi
  # Allow adding extra flags via env if needed
  if [[ -n "${BROWSER_FLAGS:-}" ]]; then
    # shellcheck disable=SC2206
    extra=( ${BROWSER_FLAGS} )
    flags+=("${extra[@]}")
  fi
  # Keep restarting the browser if it exits, to avoid dropping X.
  # Detect first visible Chromium window to hide the overlay once
  overlay_hidden=0
  while true; do
    "$BROWSER_BIN" "${flags[@]}" "$url" >> "$LOG_FILE" 2>&1 &
    CHROME_PID=$!
    # Wait for a visible Chromium window up to ~30s, then hide overlay
    if command -v xdotool >/dev/null 2>&1; then
      for i in {1..120}; do
        if xdotool search --onlyvisible --class 'Chromium|chromium' >/dev/null 2>&1; then
          if [[ "$overlay_hidden" -eq 0 ]]; then
            hide_overlay
            overlay_hidden=1
          fi
          break
        fi
        sleep 0.25
      done
    else
      # If xdotool is missing, auto-hide overlay after 20s
      if [[ "$overlay_hidden" -eq 0 ]]; then
        sleep 20
        hide_overlay
        overlay_hidden=1
      fi
    fi
    wait "$CHROME_PID"
    rc=$?
    echo "[punters] Chromium exited rc=$rc at $(date); relaunching in 3s..." >> "$LOG_FILE"
    sleep 3
  done
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
