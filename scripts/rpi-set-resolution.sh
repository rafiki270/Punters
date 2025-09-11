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
FORCE_KMS=${FORCE_KMS:-0}       # 1 to force KMS/Wayfire overrides in addition to raspi-config

if command -v raspi-config >/dev/null 2>&1; then
  echo "Setting resolution to ${WIDTH}x${HEIGHT} via raspi-config (if supported)..."
  raspi-config nonint do_resolution "$WIDTH" "$HEIGHT" || true
  echo "Setting pixel doubling to ${PIXEL_DOUBLE} via raspi-config..."
  raspi-config nonint do_pi_pixel "$PIXEL_DOUBLE" || true
else
  echo "raspi-config not found; continuing with KMS/Wayfire configuration."
fi

if [[ "$FORCE_KMS" != "1" ]]; then
  echo "Skipping KMS/Wayfire overrides (FORCE_KMS=0). Reboot may be required for raspi-config changes."
  echo "Resolution configuration applied."
  exit 0
fi

# Detect connected KMS output (HDMI) for kernel cmdline override and Wayfire config
CONNECTOR=""
for f in /sys/class/drm/card*-HDMI-A-*; do
  [[ -d "$f" ]] || continue
  if [[ -f "$f/status" ]] && grep -q "connected" "$f/status"; then
    base=$(basename "$f") # e.g., card1-HDMI-A-1
    CONNECTOR=${base#*-}    # HDMI-A-1
    break
  fi
done

if [[ -n "$CONNECTOR" ]]; then
  echo "Detected connected display: $CONNECTOR"
  # Update kernel cmdline to force mode at boot (KMS)
  MODE_ARG="${WIDTH}x${HEIGHT}@60"
  # For 4K with pixel doubling, keep panel at native 3840x2160 and scale=2 in Wayfire
  if [[ "$PIXEL_DOUBLE" = "1" ]]; then
    MODE_ARG="3840x2160@60"
  fi
  for CMDLINE in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    [[ -f "$CMDLINE" ]] || continue
    echo "Applying KMS mode to $CMDLINE: video=${CONNECTOR}:${MODE_ARG}"
    # Remove existing video=$CONNECTOR entries
    sed -i -E "s#\s*video=${CONNECTOR}:[^\s]*##g" "$CMDLINE"
    # Append our video= arg if not present
    if ! grep -q "video=${CONNECTOR}:" "$CMDLINE"; then
      sed -i "1 s/$/ video=${CONNECTOR}:${MODE_ARG}/" "$CMDLINE"
    fi
  done

  # Wayfire per-output configuration (user session)
  # Target autologin user if available
  AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
  if [[ -z "$AUTOLOGIN_USER" ]]; then
    AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf.d/*.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
  fi
  USER_NAME=${AUTOLOGIN_USER:-kiosk}
  USER_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)
  if [[ -n "$USER_HOME" ]]; then
    WF_INI="$USER_HOME/.config/wayfire.ini"
    mkdir -p "$USER_HOME/.config"
    SEC_HEADER="[output:${CONNECTOR}]"
    MODE_LINE="mode = ${MODE_ARG}"
    SCALE_LINE="scale = $([[ "$PIXEL_DOUBLE" = "1" ]] && echo 2 || echo 1)"
    if [[ -f "$WF_INI" ]] && grep -q "^\[output:${CONNECTOR}\]" "$WF_INI"; then
      awk -v sec="$SEC_HEADER" -v m="$MODE_LINE" -v s="$SCALE_LINE" '
        BEGIN{insec=0}
        $0==sec{print; insec=1; next}
        /^\[/{if(insec&&!seen_m){print m} if(insec&&!seen_s){print s} insec=0}
        {if(insec){if($0 ~ /^mode\s*=/){$0=m; seen_m=1}
                    if($0 ~ /^scale\s*=/){$0=s; seen_s=1}}
         print}
        END{if(insec&&!seen_m) print m; if(insec&&!seen_s) print s; if(!insec&&!found){print sec"\n"m"\n"s}}
      ' "$WF_INI" >"$WF_INI.tmp" || true
      mv "$WF_INI.tmp" "$WF_INI" 2>/dev/null || true
    else
      printf "\n%s\n%s\n%s\n" "$SEC_HEADER" "$MODE_LINE" "$SCALE_LINE" >> "$WF_INI"
    fi
    chown -R "$USER_NAME:$USER_NAME" "$USER_HOME/.config" || true
  fi
else
  echo "No connected HDMI output detected; skipping KMS/Wayfire overrides."
fi

echo "Resolution configuration applied. A reboot may be required to fully take effect."
