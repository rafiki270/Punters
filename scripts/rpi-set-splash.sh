#!/usr/bin/env bash
# Configure Raspberry Pi boot splash to use Punters image.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

if [[ "${SKIP_SPLASH:-}" = "1" ]]; then
  echo "SKIP_SPLASH=1 set — skipping splash configuration."
  exit 0
fi

IMG=${1:-/opt/punters/resources/info.png}
THEME_DIR=/usr/share/plymouth/themes
THEME_NAME=punters
TARGET_DIR="$THEME_DIR/$THEME_NAME"

if [[ ! -f "$IMG" ]]; then
  echo "Splash image not found at $IMG — skipping splash setup."
  exit 0
fi

changed=0

# Fast path: if theme already active and image unchanged, skip everything.
if [[ -f /etc/plymouth/plymouthd.conf ]] && \
   grep -q '^Theme=\s*punters\b' /etc/plymouth/plymouthd.conf 2>/dev/null && \
   [[ -f "$TARGET_DIR/splash.png" ]] && \
   cmp -s "$IMG" "$TARGET_DIR/splash.png"; then
  echo "Plymouth theme already set to 'punters' with identical image — skipping."
  exit 0
fi

echo "Ensuring plymouth packages (if missing)…"
export DEBIAN_FRONTEND=noninteractive
if ! dpkg -s plymouth >/dev/null 2>&1 || ! dpkg -s plymouth-themes >/dev/null 2>&1; then
  apt-get update -y >/dev/null 2>&1 || true
  apt-get install -y plymouth plymouth-themes >/dev/null 2>&1 || true
fi

mkdir -p "$TARGET_DIR"

if [[ -d "$THEME_DIR/pix" ]]; then
  cp -a "$THEME_DIR/pix/." "$TARGET_DIR/"
elif [[ -d "$THEME_DIR/spinner" ]]; then
  cp -a "$THEME_DIR/spinner/." "$TARGET_DIR/"
else
  # Create a minimal theme if none exist
  cat >"$TARGET_DIR/$THEME_NAME.plymouth" <<PLY
[Plymouth Theme]
Name=Punters Splash
Description=Punters custom splash
ModuleName=script

[script]
ImageDir=/usr/share/plymouth/themes/$THEME_NAME
ScriptFile=/usr/share/plymouth/themes/$THEME_NAME/$THEME_NAME.script
PLY
  cat >"$TARGET_DIR/$THEME_NAME.script" <<'SCRIPT'
# Plymouth theme script: show a single centered image
Window.SetBackgroundTopColor(0.0, 0.0, 0.0);      # black
Window.SetBackgroundBottomColor(0.0, 0.0, 0.0);   # black
image = Image("splash.png");
sprite = Sprite(image);
screen = Window.GetSurface();
w = image.GetWidth();
h = image.GetHeight();
sw = Window.GetWidth();
sh = Window.GetHeight();
sprite.SetX((sw - w) / 2);
sprite.SetY((sh - h) / 2);
SCRIPT
fi

old_sum=""
new_sum=""
if [[ -f "$TARGET_DIR/splash.png" ]]; then
  old_sum=$(sha256sum "$TARGET_DIR/splash.png" 2>/dev/null | awk '{print $1}')
fi
new_sum=$(sha256sum "$IMG" 2>/dev/null | awk '{print $1}')
if [[ "$old_sum" != "$new_sum" ]]; then
  install -m 644 "$IMG" "$TARGET_DIR/splash.png"
  changed=1
fi

# Rename theme metadata to punters
if [[ -f "$TARGET_DIR/pix.plymouth" ]]; then
  sed "s/^Name=.*/Name=Punters Splash/; s/^Description=.*/Description=Punters custom splash/; s#^ImageDir=.*#ImageDir=$TARGET_DIR#; s#^ScriptFile=.*#ScriptFile=$TARGET_DIR/pix.script#" \
    "$TARGET_DIR/pix.plymouth" >"$TARGET_DIR/$THEME_NAME.plymouth" || true
fi

current_theme=""
if [[ -f /etc/plymouth/plymouthd.conf ]]; then
  current_theme=$(awk -F= '/^Theme/{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}' /etc/plymouth/plymouthd.conf 2>/dev/null || true)
fi

if [[ "$current_theme" != "$THEME_NAME" ]]; then
  echo "Setting default plymouth theme to $THEME_NAME…"
  if command -v plymouth-set-default-theme >/dev/null 2>&1; then
    plymouth-set-default-theme "$THEME_NAME" >/dev/null 2>&1 || true
  fi
  changed=1
fi

if [[ "$changed" = "1" ]]; then
  echo "Theme/image changed — rebuilding initramfs…"
  if command -v update-initramfs >/dev/null 2>&1; then
    update-initramfs -u >/dev/null 2>&1 || true
  fi
else
  echo "No changes detected — skipping initramfs rebuild."
fi

# Ensure splash is enabled at boot (Bookworm uses /boot/firmware)
for CMDLINE in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
  [[ -f "$CMDLINE" ]] || continue
  if ! grep -q '\bsplash\b' "$CMDLINE"; then
    sed -i '1 s/$/ splash/' "$CMDLINE"
  fi
  if ! grep -q '\bquiet\b' "$CMDLINE"; then
    sed -i '1 s/$/ quiet/' "$CMDLINE"
  fi
  if ! grep -q '\bplymouth.ignore-serial-consoles\b' "$CMDLINE"; then
    sed -i '1 s/$/ plymouth.ignore-serial-consoles/' "$CMDLINE"
  fi
done

# Avoid firmware rainbow splash (optional)
for CONFIG in /boot/firmware/config.txt /boot/config.txt; do
  [[ -f "$CONFIG" ]] || continue
  if ! grep -q '^disable_splash=' "$CONFIG"; then
    printf "\ndisable_splash=1\n" >> "$CONFIG"
  else
    sed -i 's/^disable_splash=.*/disable_splash=1/' "$CONFIG"
  fi
done

echo "Custom splash configured. It takes effect after a reboot."
