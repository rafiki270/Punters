#!/usr/bin/env bash
# Raspberry Pi setup for Punters kiosk: create user, install deps, enable SSH/VNC, and configure autologin.
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

KIOSK_USER=${KIOSK_USER:-kiosk}
KIOSK_PASSWORD=${KIOSK_PASSWORD-}
KIOSK_GROUPS=${KIOSK_GROUPS:-"autologin,video,audio,input,netdev,tty,render"}

echo "[1/5] Creating kiosk user: ${KIOSK_USER}"
if id -u "$KIOSK_USER" >/dev/null 2>&1; then
  echo "User $KIOSK_USER already exists."
else
  adduser --disabled-password --gecos "" "$KIOSK_USER"
  if [ -n "${KIOSK_PASSWORD}" ]; then
    echo "${KIOSK_USER}:${KIOSK_PASSWORD}" | chpasswd || true
  else
    passwd -d "$KIOSK_USER" || true
  fi
fi

# Ensure groups exist and add user to them
IFS=',' read -r -a groups <<<"$KIOSK_GROUPS"
for g in "${groups[@]}"; do
  g_trim=$(echo "$g" | xargs)
  [ -z "$g_trim" ] && continue
  if ! getent group "$g_trim" >/dev/null 2>&1; then
    groupadd "$g_trim" || true
  fi
  usermod -a -G "$g_trim" "$KIOSK_USER" || true
done

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
# Ensure LightDM is present and enabled
apt-get install -y lightdm >/dev/null 2>&1 || true
systemctl enable lightdm || true
systemctl set-default graphical.target || true

# Determine desktop session for autologin
SES=""
if [ -f /usr/share/wayland-sessions/wayfire.desktop ]; then
  SES="wayfire"
elif [ -f /usr/share/xsessions/LXDE-pi.desktop ]; then
  SES="LXDE-pi"
elif [ -f /usr/share/xsessions/LXDE.desktop ]; then
  SES="LXDE"
fi

# Configure autologin for kiosk user
mkdir -p /etc/lightdm/lightdm.conf.d
{
  echo "[Seat:*]"
  echo "autologin-user=${KIOSK_USER}"
  echo "autologin-user-timeout=0"
  [ -n "$SES" ] && echo "autologin-session=${SES}"
} >/etc/lightdm/lightdm.conf.d/12-punters-autologin.conf

echo "[5/5] Preparing /opt/punters and permissions"
mkdir -p /opt/punters
chown -R "${KIOSK_USER}:${KIOSK_USER}" /opt/punters || true

echo "Setup complete. You can now run:"
echo "  sudo ./scripts/rpi-enable-kiosk.sh server"
echo "or"
echo "  sudo ./scripts/rpi-enable-kiosk.sh client http://SERVER:PORT"
