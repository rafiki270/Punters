#!/usr/bin/env bash
# Configure Raspberry Pi boot splash to use Punters image.
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

IMG=${1:-/opt/punters/resources/info.png}
THEME_DIR=/usr/share/plymouth/themes
THEME_NAME=punters
TARGET_DIR="$THEME_DIR/$THEME_NAME"

if [[ ! -f "$IMG" ]]; then
  echo "Splash image not found at $IMG — skipping splash setup."
  exit 0
fi

echo "Installing plymouth packages (if missing)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y plymouth plymouth-themes >/dev/null 2>&1 || true

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

# Replace theme image with provided one
install -m 644 "$IMG" "$TARGET_DIR/splash.png"

# Rename theme metadata to punters
if [[ -f "$TARGET_DIR/pix.plymouth" ]]; then
  sed "s/^Name=.*/Name=Punters Splash/; s/^Description=.*/Description=Punters custom splash/; s#^ImageDir=.*#ImageDir=$TARGET_DIR#; s#^ScriptFile=.*#ScriptFile=$TARGET_DIR/pix.script#" \
    "$TARGET_DIR/pix.plymouth" >"$TARGET_DIR/$THEME_NAME.plymouth" || true
fi

echo "Setting default plymouth theme to $THEME_NAME and rebuilding initramfs…"
if command -v plymouth-set-default-theme >/dev/null 2>&1; then
  plymouth-set-default-theme -R "$THEME_NAME" >/dev/null 2>&1 || plymouth-set-default-theme "$THEME_NAME" || true
fi
if command -v update-initramfs >/dev/null 2>&1; then
  update-initramfs -u >/dev/null 2>&1 || true
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

