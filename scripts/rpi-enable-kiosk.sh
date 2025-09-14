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

echo "[3/4] Installing LightDM X session for Chromium-only kiosk"
# Ensure LightDM is present and enabled
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y lightdm >/dev/null 2>&1 || true
systemctl enable lightdm || true
systemctl set-default graphical.target || true

# Create X session that runs only our launcher script
SESSION_DESKTOP=/usr/share/xsessions/punters-kiosk.desktop
cat >"$SESSION_DESKTOP" <<DESK
[Desktop Entry]
Name=Punters Kiosk
Comment=Chromium fullscreen kiosk session
Exec=/usr/bin/env bash -lc '$INSTALL_DIR/scripts/rpi-kiosk-launch.sh'
Type=Application
DesktopNames=punters-kiosk
X-LightDM-DesktopName=punters-kiosk
DESK

# Configure LightDM to autologin into our kiosk session
mkdir -p /etc/lightdm/lightdm.conf.d
cat >/etc/lightdm/lightdm.conf.d/99-punters-kiosk.conf <<LDM
[Seat:*]
autologin-user=$TARGET_USER
autologin-user-timeout=0
autologin-session=punters-kiosk
LDM

# If an old systemd unit exists, disable it to avoid duplication
if systemctl is-enabled --quiet punters-kiosk.service 2>/dev/null; then
  systemctl disable --now punters-kiosk.service || true
fi

echo "[4/4] Kiosk session installed. Reboot to start kiosk."

echo "Done. Reboot to test kiosk autostart: sudo reboot"
