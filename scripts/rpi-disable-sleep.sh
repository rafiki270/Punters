#!/usr/bin/env bash
# Disable screen blanking, DPMS, and screensavers for the desktop session.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

KIOSK_USER=${KIOSK_USER:-kiosk}

# Detect autologin user from LightDM; fallback to kiosk
AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
if [[ -z "$AUTOLOGIN_USER" ]]; then
  AUTOLOGIN_USER=$(grep -h "^autologin-user=" /etc/lightdm/lightdm.conf.d/*.conf 2>/dev/null | cut -d= -f2 | tail -1 || true)
fi
TARGET_USER=${AUTOLOGIN_USER:-$KIOSK_USER}
USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)

if [[ -z "$USER_HOME" ]]; then
  echo "Could not determine home for $TARGET_USER (skipping session config)" >&2
else
  echo "Configuring session for user $TARGET_USER to disable sleep/blanking..."

  # Autostart entry to run xset commands at login (LXDE/Wayfire/Xwayland)
  AUTOSTART_DIR="$USER_HOME/.config/autostart"
  mkdir -p "$AUTOSTART_DIR"
  cat >"$AUTOSTART_DIR/punters-nosleep.desktop" <<'DESK'
[Desktop Entry]
Type=Application
Name=Disable Sleep/DPMS
Comment=Turn off screensaver and DPMS on login
Exec=/usr/bin/env bash -lc 'for i in {1..30}; do xset s off -dpms s noblank >/dev/null 2>&1 && exit 0; sleep 1; done'
X-GNOME-Autostart-enabled=true
Terminal=false
DESK
  chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config"

  # Wayfire (Bookworm): disable idle/dpms timeouts in config
  WF_INI="$USER_HOME/.config/wayfire.ini"
  mkdir -p "$USER_HOME/.config"
  if [[ -f "$WF_INI" ]]; then
    # Update existing [idle] section or append one
    if grep -q '^\[idle\]' "$WF_INI"; then
      sed -i \
        -e 's/^\(dpms_timeout\)=.*/\1 = 0/' \
        -e 's/^\(screensaver_timeout\)=.*/\1 = 0/' \
        "$WF_INI" || true
      # Ensure options exist even if missing
      awk '/^\[idle\]/{print; f=1; next} /^\[/{f=0} f && /dpms_timeout/ {d=1} f && /screensaver_timeout/ {s=1} {print} END{if(f && !d) print "dpms_timeout = 0"; if(f && !s) print "screensaver_timeout = 0"}' "$WF_INI" >"$WF_INI.tmp" && mv "$WF_INI.tmp" "$WF_INI"
    else
      printf "\n[idle]\n# disable idle and DPMS for kiosk\ndpms_timeout = 0\nscreensaver_timeout = 0\n" >> "$WF_INI"
    fi
  else
    printf "[idle]\n# disable idle and DPMS for kiosk\ndpms_timeout = 0\nscreensaver_timeout = 0\n" > "$WF_INI"
  fi
  chown "$TARGET_USER:$TARGET_USER" "$WF_INI" || true

  # LXDE: ensure xset lines are present in lxsession autostart
  for LXDIR in "$USER_HOME/.config/lxsession/LXDE-pi" "$USER_HOME/.config/lxsession/LXDE"; do
    mkdir -p "$LXDIR"
    AUT="$LXDIR/autostart"
    touch "$AUT"
    grep -q 'xset s off' "$AUT" || echo '@xset s off' >> "$AUT"
    grep -q 'xset -dpms' "$AUT" || echo '@xset -dpms' >> "$AUT"
    grep -q 'xset s noblank' "$AUT" || echo '@xset s noblank' >> "$AUT"
    chown -R "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config/lxsession" || true
  done
fi

# System console (VT) blanking off
for CMDLINE in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  [[ -f "$CMDLINE" ]] || continue
  if ! grep -q '\bconsoleblank=0\b' "$CMDLINE"; then
    sed -i '1 s/$/ consoleblank=0/' "$CMDLINE"
  fi
done

# Remove or disable common screensavers if present
apt-get remove -y --purge xscreensaver light-locker >/dev/null 2>&1 || true

echo "Sleep/screensaver disabled. Reboot recommended."

