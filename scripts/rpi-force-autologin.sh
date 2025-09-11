#!/usr/bin/env bash
# Force desktop and console autologin for the kiosk user on Raspberry Pi OS.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

KIOSK_USER=${KIOSK_USER:-kiosk}
KIOSK_PASSWORD=${KIOSK_PASSWORD-}

echo "[1/4] Ensure kiosk user exists (no password) and in common groups"
if ! id -u "$KIOSK_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$KIOSK_USER"
fi
if [[ -n "${KIOSK_PASSWORD}" ]]; then
  echo "${KIOSK_USER}:${KIOSK_PASSWORD}" | chpasswd || true
else
  passwd -d "$KIOSK_USER" || true
fi
for g in autologin video audio input netdev tty render; do
  getent group "$g" >/dev/null 2>&1 || groupadd "$g" || true
  usermod -a -G "$g" "$KIOSK_USER" || true
done

echo "[2/4] Force TTY1 autologin to ${KIOSK_USER} (console fallback)"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat >/etc/systemd/system/getty@tty1.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${KIOSK_USER} --noclear %I \$TERM
EOF
systemctl daemon-reload
systemctl enable getty@tty1 || true

echo "[3/4] Ensure LightDM is installed and configure desktop autologin"
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y lightdm >/dev/null 2>&1 || true
systemctl enable lightdm || true
systemctl set-default graphical.target || true

SESSION=""
if [ -f /usr/share/wayland-sessions/wayfire.desktop ]; then
  SESSION="wayfire"
elif [ -f /usr/share/xsessions/LXDE-pi.desktop ]; then
  SESSION="LXDE-pi"
elif [ -f /usr/share/xsessions/LXDE.desktop ]; then
  SESSION="LXDE"
fi
mkdir -p /etc/lightdm/lightdm.conf.d
{
  echo "[Seat:*]"
  echo "autologin-user=${KIOSK_USER}"
  echo "autologin-user-timeout=0"
  if [[ -n "$SESSION" ]]; then echo "autologin-session=${SESSION}"; fi
} >/etc/lightdm/lightdm.conf.d/12-punters-autologin.conf

echo "[4/4] Done. Reboot to apply autologin changes."
echo "You can reboot now with: sudo reboot"

