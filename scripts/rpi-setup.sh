#!/usr/bin/env bash
# Raspberry Pi setup for Punters kiosk: create user, install deps, enable SSH/VNC, and configure autologin.
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

KIOSK_USER=${KIOSK_USER:-kiosk}
KIOSK_GROUPS=${KIOSK_GROUPS:-"autologin,video,audio,input,netdev,tty,render"}

echo "[1/5] Creating kiosk user: ${KIOSK_USER}"
if id -u "$KIOSK_USER" >/dev/null 2>&1; then
  echo "User $KIOSK_USER already exists."
else
  adduser --disabled-password --gecos "" "$KIOSK_USER"
fi
usermod -a -G "$KIOSK_GROUPS" "$KIOSK_USER" || true

echo "[2/5] Updating apt and installing packages (git, Node.js 18, Chromium, VNC, utilities)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Utilities and browser
apt-get install -y \
  git curl x11-xserver-utils xdotool unclutter \
  chromium-browser || true

# On newer Raspberry Pi OS, package name may be 'chromium' (without -browser)
# On newer Raspberry Pi OS, package name may be 'chromium' (without -browser)
if ! command -v chromium-browser >/dev/null 2>&1; then
  apt-get install -y chromium || true
fi

# Install Node.js 18.x via NodeSource (includes npm)
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(18|20)\.'; then
  echo "Installing Node.js 18 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# Enable SSH and VNC
echo "[3/5] Enabling SSH and VNC"
if command -v raspi-config >/dev/null 2>&1; then
  # 0 = enable
  raspi-config nonint do_ssh 0 || true
  raspi-config nonint do_vnc 0 || true
else
  systemctl enable --now ssh || true
  apt-get install -y realvnc-vnc-server || true
  systemctl enable --now vncserver-x11-serviced || true
fi

echo "[4/5] Configuring desktop autologin for user ${KIOSK_USER}"
# Try raspi-config for Desktop Autologin; fallback to LightDM config
if command -v raspi-config >/dev/null 2>&1; then
  # B4 is Desktop Autologin on many releases; ignore failure and fallback
  raspi-config nonint do_boot_behaviour B4 || true
fi

mkdir -p /etc/lightdm/lightdm.conf.d
cat >/etc/lightdm/lightdm.conf.d/12-punters-autologin.conf <<CONF
[Seat:*]
autologin-user=${KIOSK_USER}
autologin-user-timeout=0
user-session=lightdm-autologin
CONF

echo "[5/5] Preparing /opt/punters and permissions"
mkdir -p /opt/punters
chown -R "${KIOSK_USER}:${KIOSK_USER}" /opt/punters || true

echo "Setup complete. You can now run:"
echo "  sudo ./scripts/rpi-enable-kiosk.sh server"
echo "or"
echo "  sudo ./scripts/rpi-enable-kiosk.sh client http://SERVER:PORT"
