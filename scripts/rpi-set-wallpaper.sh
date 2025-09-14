#!/usr/bin/env bash
# Set desktop wallpaper for the autologin desktop user (default: kiosk)
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

if [[ "${SKIP_WALLPAPER:-}" = "1" ]]; then
  echo "SKIP_WALLPAPER=1 set — skipping wallpaper setup."
  exit 0
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

echo "Installing optional wallpaper tools (feh/pcmanfm)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y feh pcmanfm >/dev/null 2>&1 || true

AUTOSTART_DIR="$USER_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat >"$AUTOSTART_DIR/punters-wallpaper.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Punters Wallpaper
Comment=Set wallpaper on login
Exec=/usr/bin/env bash -lc 'if command -v feh >/dev/null 2>&1; then feh --no-fehbg --bg-fill "${IMG_PATH}" >/dev/null 2>&1 || true; elif command -v pcmanfm >/dev/null 2>&1; then pcmanfm --set-wallpaper "${IMG_PATH}" --wallpaper-mode=fit >/dev/null 2>&1 || true; fi'
X-GNOME-Autostart-enabled=true
Terminal=false
NoDisplay=true
DESK
chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config"

echo "Wallpaper configured for user $TARGET_USER. It will apply on next login."
