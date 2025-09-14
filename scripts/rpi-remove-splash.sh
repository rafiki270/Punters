#!/usr/bin/env bash
# Remove Plymouth splash/theme and related boot splash settings on Raspberry Pi OS.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

echo "Disabling boot splash (Plymouth) and restoring fast boot..."

# 1) Remove splash keywords from kernel cmdline
for CMDLINE in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  [[ -f "$CMDLINE" ]] || continue
  sed -i -E 's/\s+quiet\b//g; s/\s+splash\b//g; s/\s+plymouth.ignore-serial-consoles\b//g' "$CMDLINE" || true
done

# 2) Force firmware rainbow splash off
for CONFIG in /boot/firmware/config.txt /boot/config.txt; do
  [[ -f "$CONFIG" ]] || continue
  if grep -q '^disable_splash=' "$CONFIG"; then
    sed -i 's/^disable_splash=.*/disable_splash=1/' "$CONFIG" || true
  else
    printf "\ndisable_splash=1\n" >> "$CONFIG"
  fi
done

# 3) If Plymouth present, set text theme and remove custom theme directory
if [[ -d /usr/share/plymouth/themes ]]; then
  if command -v plymouth-set-default-theme >/dev/null 2>&1; then
    plymouth-set-default-theme text >/dev/null 2>&1 || true
  fi
  rm -rf /usr/share/plymouth/themes/punters 2>/dev/null || true
fi

# 4) Optionally purge plymouth packages entirely (fastest boots)
export DEBIAN_FRONTEND=noninteractive
apt-get purge -y plymouth plymouth-themes >/dev/null 2>&1 || true

# 5) Rebuild initramfs if available
if command -v update-initramfs >/dev/null 2>&1; then
  update-initramfs -u >/dev/null 2>&1 || true
fi

echo "Splash disabled. Reboot recommended: sudo reboot"

