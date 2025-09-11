#!/usr/bin/env bash
# Set Raspberry Pi display resolution to a target (default 1920x1080@60Hz) and enable pixel doubling if requested.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

WIDTH=${1:-1920}
HEIGHT=${2:-1080}
PIXEL_DOUBLE=${PIXEL_DOUBLE:-0} # 0 or 1 (value passed to raspi-config do_pi_pixel)

if command -v raspi-config >/dev/null 2>&1; then
  echo "Setting resolution to ${WIDTH}x${HEIGHT} via raspi-config..."
  raspi-config nonint do_resolution "$WIDTH" "$HEIGHT" || true
  echo "Setting pixel doubling to ${PIXEL_DOUBLE} via raspi-config..."
  raspi-config nonint do_pi_pixel "$PIXEL_DOUBLE" || true
else
  echo "raspi-config not found; skipping low-level resolution configuration."
fi

echo "Resolution configuration applied (may require reboot)."

