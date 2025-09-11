#!/usr/bin/env bash
# Set desktop wallpaper for the autologin desktop user (default: kiosk)
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

IMG_PATH=${1:-/opt/punters/web/public/bcg/weathered wood.jpg}
KIOSK_USER=${KIOSK_USER:-kiosk}

# Detect autologin user from LightDM; fallback to kiosk
AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
if [[ -z "$AUTOLOGIN_USER" ]]; then
  AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf.d/*.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
fi
TARGET_USER=${AUTOLOGIN_USER:-$KIOSK_USER}

USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
if [[ -z "$USER_HOME" ]]; then
  echo "Could not determine home for $TARGET_USER" >&2
  exit 0
fi

if [[ ! -f "$IMG_PATH" ]]; then
  echo "Wallpaper image not found at: $IMG_PATH (skipping)" >&2
  exit 0
fi

echo "Installing optional wallpaper tools (pcmanfm/feh)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y pcmanfm feh >/dev/null 2>&1 || true

AUTOSTART_DIR="$USER_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat >"$AUTOSTART_DIR/punters-wallpaper.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Punters Wallpaper
Comment=Set wallpaper on login
Exec=/usr/bin/env bash -lc 'if command -v pcmanfm >/dev/null 2>&1; then pcmanfm --set-wallpaper "${IMG_PATH}" --wallpaper-mode=fit; elif command -v feh >/dev/null 2>&1; then feh --bg-fill "${IMG_PATH}"; fi'
X-GNOME-Autostart-enabled=true
Terminal=false
DESK
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config"

echo "Wallpaper configured for user $TARGET_USER. It will apply on next login."

