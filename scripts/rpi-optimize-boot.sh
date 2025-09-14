#!/usr/bin/env bash
# Optimize Raspberry Pi boot for kiosk: remove splash, mask wait-online, and disable unused services.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

# Optional toggles (0/1)
DISABLE_BT=${DISABLE_BT:-0}          # bluetooth + hciuart
DISABLE_AVAHI=${DISABLE_AVAHI:-0}    # mDNS/Bonjour
DISABLE_SWAP=${DISABLE_SWAP:-0}      # dphys-swapfile

echo "== Optimizing boot for kiosk =="

echo "[1/6] Removing/Disabling boot splash (plymouth)"
if [[ -x "$(dirname "$0")/rpi-remove-splash.sh" ]]; then
  "$(dirname "$0")/rpi-remove-splash.sh" || true
else
  echo "rpi-remove-splash.sh not found; skipping plymouth removal"
fi

echo "[2/6] Mask NetworkManager-wait-online (6–10s delays)"
systemctl mask --now NetworkManager-wait-online.service >/dev/null 2>&1 || true

echo "[3/6] Disable ModemManager (no cellular modem on most Pis)"
if systemctl is-enabled ModemManager.service >/dev/null 2>&1; then
  systemctl disable --now ModemManager.service || true
fi

echo "[4/6] Mask Raspberry Pi GPU test services (glamor/rp1)"
systemctl mask --now glamor-test.service >/dev/null 2>&1 || true
systemctl mask --now rp1-test.service >/dev/null 2>&1 || true

echo "[5/6] Optional components based on env flags"
if [[ "$DISABLE_BT" = "1" ]]; then
  echo " - Disabling Bluetooth services"
  systemctl disable --now bluetooth.service >/dev/null 2>&1 || true
  systemctl disable --now hciuart.service >/dev/null 2>&1 || true
fi
if [[ "$DISABLE_AVAHI" = "1" ]]; then
  echo " - Disabling Avahi (mDNS)"
  systemctl disable --now avahi-daemon.service avahi-daemon.socket >/dev/null 2>&1 || true
fi
if [[ "$DISABLE_SWAP" = "1" ]]; then
  echo " - Disabling dphys-swapfile"
  systemctl disable --now dphys-swapfile.service >/dev/null 2>&1 || true
fi

echo "[6/6] Ensuring desktop managers are off (pure console)"
for dm in lightdm gdm3 sddm; do
  systemctl disable --now "$dm" >/dev/null 2>&1 || true
done

echo "Done. Reboot recommended: sudo reboot"

