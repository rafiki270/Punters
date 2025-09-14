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

# Display prep moved to background function (prep_display)

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

# Simple timestamped logger that truncates on first use
_KIOSK_LOG_INIT=0
log() {
  local msg="$*"
  local LOG_DIR="$HOME/.local/share/punters"
  local LOG_FILE="$LOG_DIR/kiosk.log"
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  if [[ $_KIOSK_LOG_INIT -eq 0 ]]; then
    # Fallback to /tmp if not writable
    if ! (touch "$LOG_FILE" >/dev/null 2>&1); then
      LOG_DIR="/tmp/punters"
      mkdir -p "$LOG_DIR" 2>/dev/null || true
      LOG_FILE="$LOG_DIR/kiosk.log"
    fi
    : > "$LOG_FILE" 2>/dev/null || true
    _KIOSK_LOG_INIT=1
  fi
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S%z')" "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

log "kiosk: starting MODE=$MODE INSTALL_DIR=$INSTALL_DIR USER=$(id -un) UID=${UID:-} DISPLAY=${DISPLAY:-} XAUTH=${XAUTHORITY:-}"

# Prepare display settings in background: disable blanking and set resolution
prep_display() {
  if command -v xset >/dev/null 2>&1; then
    for i in {1..10}; do
      xset q >/dev/null 2>&1 && break || true
      sleep 0.5
    done
    xset s off || true
    xset -dpms || true
    xset s noblank || true
    log "xset: s off, -dpms, s noblank applied"
  fi
  if command -v xrandr >/dev/null 2>&1; then
    local primary_output pref_line native_w native_h
    primary_output=$(xrandr --query 2>/dev/null | awk '/ connected primary/{print $1; exit} / connected/{print $1; exit}')
    if [[ -n "${primary_output:-}" ]]; then
      pref_line=$(xrandr --query 2>/dev/null | awk -v out="$primary_output" 'f && /\*/{print; exit} $1==out{f=1}')
      native_w=$(awk '{print $1}' <<<"$pref_line" | cut -dx -f1)
      native_h=$(awk '{print $1}' <<<"$pref_line" | cut -dx -f2)
      FORCE_1080P=${FORCE_1080P:-0}
      if [[ -n "$native_w" && "$native_w" -ge 3000 && "$FORCE_1080P" != "1" ]]; then
        export BROWSER_FLAGS="${BROWSER_FLAGS:-} --high-dpi-support=1 --force-device-scale-factor=2"
        xrandr --output "$primary_output" --mode "${native_w}x${native_h}" >/dev/null 2>&1 || true
        log "xrandr: set $primary_output to native ${native_w}x${native_h}; enabling 2x scale"
      else
        xrandr --output "$primary_output" --mode 1920x1080 --rate 60 >/dev/null 2>&1 || true
        log "xrandr: set $primary_output to 1920x1080@60"
      fi
    fi
  fi
}

# Reset display to a clean, native fullscreen state before launching Chromium
reset_display() {
  # Ensure X is ready for xrandr/xset
  if command -v xset >/dev/null 2>&1; then
    for i in {1..20}; do
      xset q >/dev/null 2>&1 && break || true
      sleep 0.25
    done
    xset s off || true
    xset -dpms || true
    xset s noblank || true
  fi
  if ! command -v xrandr >/dev/null 2>&1; then
    return
  fi
  local out pref native_w native_h
  out=$(xrandr --query 2>/dev/null | awk '/ connected primary/{print $1; exit} / connected/{print $1; exit}')
  if [[ -z "$out" ]]; then
    return
  fi
  # Find the preferred mode (line with a *) after the output header
  pref=$(xrandr --query 2>/dev/null | awk -v o="$out" 'f && /\*/{print $1; exit} $1==o{f=1}')
  if [[ -n "$pref" ]]; then
    native_w="${pref%x*}"
    native_h="${pref#*x}"
  fi
  # Clear any previous transforms/panning that could shrink to left portion
  xrandr --output "$out" --rotate normal --reflect normal --scale 1x1 --transform none --panning 0x0+0+0 >/dev/null 2>&1 || true
  log "xrandr: cleared transforms on $out"
  # Set to preferred native mode if known; otherwise keep current
  if [[ -n "$native_w" && -n "$native_h" ]]; then
    xrandr --output "$out" --mode "${native_w}x${native_h}" >/dev/null 2>&1 || true
    log "xrandr: set $out preferred mode ${native_w}x${native_h}"
    # If 4K or wider, render at 2x scale for crisp UI
    if [[ "$native_w" -ge 3000 ]]; then
      export BROWSER_FLAGS="${BROWSER_FLAGS:-} --high-dpi-support=1 --force-device-scale-factor=2"
      log "chromium: adding 2x scale flags for 4K"
    fi
  fi
}

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
  log "chromium: launch -> $url"
  # Ensure display is in a sane native mode before starting the browser
  reset_display
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
    --user-data-dir="$HOME/.config/chromium-kiosk"
    --disk-cache-dir="/dev/shm/chromium-cache"
    --overscroll-history-navigation=0
  )
  # If running under Wayland, enable Ozone/Wayland. Otherwise stick to X11 defaults.
  if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    flags+=(--enable-features=UseOzonePlatform --ozone-platform=wayland)
    log "chromium: WAYLAND mode with ozone flags"
  else
    log "chromium: X11 mode"
  fi
  # Allow adding extra flags via env if needed
  if [[ -n "${BROWSER_FLAGS:-}" ]]; then
    # shellcheck disable=SC2206
    extra=( ${BROWSER_FLAGS} )
    flags+=("${extra[@]}")
    log "chromium: extra flags -> ${BROWSER_FLAGS}"
  fi
  # Keep restarting the browser if it exits, to avoid dropping X.
  # Detect first visible Chromium window to hide the overlay once
  overlay_hidden=0
  while true; do
    "$BROWSER_BIN" "${flags[@]}" "$url" >> /dev/null 2>&1 &
    CHROME_PID=$!
    log "chromium: started pid=$CHROME_PID"
    # Wait for a visible Chromium window up to ~30s, then hide overlay
    if command -v xdotool >/dev/null 2>&1; then
      for i in {1..120}; do
        if xdotool search --onlyvisible --class 'Chromium|chromium' >/dev/null 2>&1; then
          if [[ "$overlay_hidden" -eq 0 ]]; then
            hide_overlay
            overlay_hidden=1
            log "overlay: hidden after window detected"
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
        log "overlay: hidden after timeout"
      fi
    fi
    wait "$CHROME_PID"
    rc=$?
    log "chromium: exited rc=$rc; relaunching in 3s"
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
    # Normalize: ensure scheme present
    if [[ ! "$CLIENT_URL" =~ ^https?:// ]]; then
      CLIENT_URL="http://$CLIENT_URL"
    fi
    log "client: url=$CLIENT_URL"
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
