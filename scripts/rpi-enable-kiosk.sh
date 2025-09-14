#!/usr/bin/env bash
# Enable Punters kiosk autostart via systemd. Copies repo to /opt and configures mode.
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

MODE=${1:-}
CLIENT_URL=${2:-}
INSTALL_DIR=${INSTALL_DIR:-/opt/punters}
KIOSK_USER=${KIOSK_USER:-kiosk}
# Try to detect the autologin desktop user to ensure DISPLAY access
AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
if [[ -z "$AUTOLOGIN_USER" ]]; then
  AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf.d/*.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
fi

# Choose target user: prefer autologin user if present; else kiosk if exists; else pi
TARGET_USER="$KIOSK_USER"
if [[ -n "$AUTOLOGIN_USER" ]]; then
  TARGET_USER="$AUTOLOGIN_USER"
elif id -u "$KIOSK_USER" >/dev/null 2>&1; then
  TARGET_USER="$KIOSK_USER"
elif id -u pi >/dev/null 2>&1; then
  TARGET_USER=pi
fi

KIOSK_UID=$(id -u "$TARGET_USER" 2>/dev/null || echo 1000)
CONFIG_FILE=/etc/default/punters-kiosk
UNIT_FILE=/etc/systemd/system/punters-kiosk.service

usage() {
  cat <<USAGE
Usage:
  sudo $0 server
  sudo $0 client <URL>

Environment:
  INSTALL_DIR=/opt/punters   # where repo lives
  KIOSK_USER=kiosk           # user to run service
USAGE
}

if [[ -z "$MODE" ]]; then
  usage; exit 1
fi
if [[ "$MODE" == "client" && -z "$CLIENT_URL" ]]; then
  echo "CLIENT_URL required for client mode" >&2
  usage; exit 1
fi

# Normalize client URL to include scheme if missing
if [[ "$MODE" == "client" && -n "$CLIENT_URL" ]]; then
  if [[ ! "$CLIENT_URL" =~ ^https?:// ]]; then
    CLIENT_URL="http://$CLIENT_URL"
  fi
fi

echo "[1/4] Installing repo into ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
# rsync if available; fallback to tar copy
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude .git ./ "$INSTALL_DIR/"
else
  tar -C . -cf - --exclude .git . | tar -C "$INSTALL_DIR" -xf -
fi
chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"
# Normalize permissions and ensure scripts are executable
find "$INSTALL_DIR" -type d -exec chmod 755 {} + 2>/dev/null || true
find "$INSTALL_DIR" -type f -exec chmod 644 {} + 2>/dev/null || true
if [[ -d "$INSTALL_DIR/scripts" ]]; then
  chmod +x "$INSTALL_DIR"/scripts/*.sh 2>/dev/null || true
fi

echo "[2/4] Writing kiosk config: ${CONFIG_FILE}"
cat >"$CONFIG_FILE" <<CFG
MODE=${MODE}
CLIENT_URL=${CLIENT_URL}
INSTALL_DIR=${INSTALL_DIR}
CFG

echo "[3/4] Installing minimal X stack (xorg + xinit) for console kiosk"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y --no-install-recommends \
  xserver-xorg x11-xserver-utils xinit xserver-xorg-legacy \
  unclutter xterm \
  chromium-browser >/dev/null 2>&1 || true
if ! command -v chromium-browser >/dev/null 2>&1; then
  apt-get install -y chromium >/dev/null 2>&1 || true
fi

# Allow non-root users to start X (Xorg wrapper)
if [[ -f /etc/Xwrapper.config ]]; then
  sed -i -E 's/^allowed_users=.*/allowed_users=anybody/' /etc/Xwrapper.config || true
  if grep -q '^needs_root_rights=' /etc/Xwrapper.config; then
    sed -i -E 's/^needs_root_rights=.*/needs_root_rights=yes/' /etc/Xwrapper.config || true
  else
    printf "\nneeds_root_rights=yes\n" >> /etc/Xwrapper.config
  fi
else
  echo -e "allowed_users=anybody\nneeds_root_rights=yes" >/etc/Xwrapper.config
fi

echo "Configuring TTY1 autologin for $TARGET_USER (console kiosk)"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat >/etc/systemd/system/getty@tty1.service.d/override.conf <<OVR
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $TARGET_USER --noclear %I \$TERM
OVR
systemctl daemon-reload
systemctl enable getty@tty1 || true
systemctl set-default multi-user.target || true

# Write user startup files to launch X + kiosk on login to tty1
USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
if [[ -n "$USER_HOME" ]]; then
  mkdir -p "$USER_HOME"
  # Start X on login at tty1
  mkdir -p "$USER_HOME/.local/share/punters" 2>/dev/null || true
  chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.local" 2>/dev/null || true
  cat >"$USER_HOME/.bash_profile" <<'BASHRC'
#!/usr/bin/env bash
# Auto-start X on TTY1 and keep retrying with logs to avoid login flicker.
if [[ -z "$DISPLAY" && "$(tty)" == "/dev/tty1" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  mkdir -p "$XDG_RUNTIME_DIR" 2>/dev/null || true
  LOG_DIR="$HOME/.local/share/punters"
  LOG_FILE="$LOG_DIR/startx.log"
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  # Fallback to /tmp if log file is not writable
  if ! (touch "$LOG_FILE" >/dev/null 2>&1); then
    LOG_DIR="/tmp/punters"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    LOG_FILE="$LOG_DIR/startx.log"
  fi
  # Truncate the log on each login to avoid unbounded growth
  : > "$LOG_FILE"
  ts() { date '+%Y-%m-%d %H:%M:%S%z'; }
  while true; do
    echo "[$(ts)] [punters] launching X (xinit)" >> "$LOG_FILE"
    xinit "$HOME/.xinitrc" -- :0 -nocursor -nolisten tcp vt1 >> "$LOG_FILE" 2>&1
    rc=$?
    echo "[$(ts)] [punters] X exited rc=$rc. Restarting in 5s..." >> "$LOG_FILE"
    sleep 5
  done
fi
BASHRC
  chmod 644 "$USER_HOME/.bash_profile"
  chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.bash_profile"

  # Minimal X init to launch our kiosk launcher
  cat >"$USER_HOME/.xinitrc" <<XRC
#!/bin/sh
# Minimal X session to launch kiosk. If it dies, .bash_profile restarts X.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-}
exec $INSTALL_DIR/scripts/rpi-kiosk-launch.sh
XRC
  chmod +x "$USER_HOME/.xinitrc"
  chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.xinitrc"

  # Ensure X starts with correct server options (rootless-safe)
  cat >"$USER_HOME/.xserverrc" <<'XSERV'
#!/bin/sh
exec /usr/lib/xorg/Xorg -nolisten tcp "$@"
XSERV
  chmod +x "$USER_HOME/.xserverrc"
  chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.xserverrc"
fi

# Disable any desktop display manager to avoid loading full OS
for dm in lightdm gdm3 sddm; do
  if systemctl is-enabled --quiet "$dm" 2>/dev/null; then
    systemctl disable --now "$dm" || true
  fi
done

# Ensure target user is in common graphics/input groups
for g in video render input tty; do
  if getent group "$g" >/dev/null 2>&1; then
    usermod -a -G "$g" "$TARGET_USER" || true
  fi
done

echo "[4/4] Console kiosk configured. On reboot, it autologins TTY1 and starts Chromium."

echo "Done. Reboot to test kiosk autostart: sudo reboot"
