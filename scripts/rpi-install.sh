#!/usr/bin/env bash
# Interactive Raspberry Pi installer for Punters.
# Intended usage:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This installer must run as root. Re-run with sudo." >&2
  exit 1
fi

REPO_URL=${REPO_URL:-https://github.com/rafiki270/Punters.git}
INSTALL_DIR=${INSTALL_DIR:-/opt/punters}
DEFAULT_HOSTNAME=${DEFAULT_HOSTNAME:-punters}
KIOSK_USER=${KIOSK_USER:-kiosk}
KIOSK_PASSWORD=${KIOSK_PASSWORD-}
PIXEL_DOUBLE=${PIXEL_DOUBLE:-}

# Load prior kiosk config to preselect defaults
PREV_MODE=""
PREV_CLIENT_URL=""
if [[ -f /etc/default/punters-kiosk ]]; then
  # shellcheck disable=SC1090
  . /etc/default/punters-kiosk || true
  if [[ -n "${MODE:-}" ]]; then PREV_MODE="$MODE"; fi
  if [[ -n "${CLIENT_URL:-}" ]]; then PREV_CLIENT_URL="$CLIENT_URL"; fi
fi

echo "== Punters Raspberry Pi Installer =="
echo "This will configure the Pi as a kiosk and autostart Chromium."
echo

read_mode() {
  local choice
  local def_choice=1
  # If we previously ran as client or have a stored URL, default to client
  if [[ "$PREV_MODE" == "client" || -n "$PREV_CLIENT_URL" ]]; then
    def_choice=2
  fi
  while true; do
    echo "Select mode:"
    echo "  1) Server (host app on this Pi)"
    echo "  2) Client (open a remote server URL)"
    read -rp "Enter 1 or 2 [${def_choice}]: " choice || true
    choice=${choice:-$def_choice}
    case "$choice" in
      1|server|Server) MODE=server; break;;
      2|client|Client) MODE=client; break;;
      *) echo "Invalid selection.";;
    esac
  done
}

read_server_inputs() {
  read -rp "Hostname for this Pi [${DEFAULT_HOSTNAME}]: " HOSTNAME_NEW || true
  HOSTNAME_NEW=${HOSTNAME_NEW:-$DEFAULT_HOSTNAME}
}

read_client_inputs() {
  local prompt="Remote server address (e.g., server.local or http://server)"
  local default="$PREV_CLIENT_URL"
  while true; do
    if [[ -n "$default" ]]; then
      read -rp "$prompt [$default]: " CLIENT_URL || true
      CLIENT_URL=${CLIENT_URL:-$default}
    else
      read -rp "$prompt: " CLIENT_URL || true
    fi
    if [[ -n "${CLIENT_URL}" ]]; then
      # Normalize: prepend http:// if no scheme provided
      if [[ ! "$CLIENT_URL" =~ ^https?:// ]]; then
        CLIENT_URL="http://$CLIENT_URL"
      fi
      break
    fi
    echo "Address cannot be empty."
  done
}

read_display_prefs() {
  local ans
  echo
  echo "Display setup:"
  # If PIXEL_DOUBLE is preseeded (0/1), honor it and skip prompt
  if [[ "${PIXEL_DOUBLE:-}" =~ ^[01]$ ]]; then
    echo "PIXEL_DOUBLE is preset to ${PIXEL_DOUBLE}. Skipping 4K prompt."
    return
  fi
  while true; do
    read -rp "Is your TV/monitor 4K (UHD)? Enable pixel doubling for crisp 1080p? [Y/n]: " ans || true
    case "${ans:-}" in
      ""|y|Y) PIXEL_DOUBLE=1; break;;
      n|N) PIXEL_DOUBLE=0; break;;
      *) echo "Please answer y or n.";;
    esac
  done
}

apt_install() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    git curl ca-certificates rsync x11-xserver-utils xdotool unclutter vim feh pcmanfm \
    xterm \
    xserver-xorg xinit xserver-xorg-legacy \
    avahi-daemon \
    chromium-browser || true
  if ! command -v chromium-browser >/dev/null 2>&1; then
    apt-get install -y chromium || true
  fi
  # Install Node.js 18 from NodeSource if needed
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(18|20)\.'; then
    echo "Installing Node.js 18 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  fi
}

enable_remote_access() {
  local ENABLE_VNC=${ENABLE_VNC:-0}
  if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_ssh 0 || true
    if [[ "$ENABLE_VNC" = "1" ]]; then
      raspi-config nonint do_vnc 0 || true
    else
      raspi-config nonint do_vnc 1 || true
      systemctl disable --now vncserver-x11-serviced >/dev/null 2>&1 || true
    fi
  else
    systemctl enable --now ssh || true
    if [[ "$ENABLE_VNC" = "1" ]]; then
      apt-get install -y realvnc-vnc-server || true
      systemctl enable --now vncserver-x11-serviced || true
    else
      systemctl disable --now vncserver-x11-serviced >/dev/null 2>&1 || true
    fi
  fi
}

setup_user_autologin() {
  # Create kiosk user and add to necessary groups; defer GUI autologin to rpi-force-autologin.sh
  if ! id -u "$KIOSK_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$KIOSK_USER"
    if [ -n "${KIOSK_PASSWORD}" ]; then
      echo "${KIOSK_USER}:${KIOSK_PASSWORD}" | chpasswd || true
    else
      passwd -d "$KIOSK_USER" || true
    fi
  fi
  for g in autologin video audio input netdev tty render; do
    getent group "$g" >/dev/null 2>&1 || groupadd "$g" || true
    usermod -a -G "$g" "$KIOSK_USER" || true
  done
}

set_hostname() {
  local new="$1"
  if [[ -n "$new" ]]; then
    echo "Setting hostname to '$new'"
    hostnamectl set-hostname "$new" || true
    # Ensure /etc/hosts has 127.0.1.1
    if grep -q "^127.0.1.1" /etc/hosts; then
      sed -i "s/^127.0.1.1.*/127.0.1.1\t${new}/" /etc/hosts
    else
      echo -e "127.0.1.1\t${new}" >> /etc/hosts
    fi
    systemctl enable --now avahi-daemon || true
  fi
}

clone_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "Repo exists in $INSTALL_DIR. Pulling latest..."
    chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR" || true
    # Avoid git safe.directory warnings
    git config --global --add safe.directory "$INSTALL_DIR" || true
    sudo -u "$KIOSK_USER" git -C "$INSTALL_DIR" fetch --all --prune || true
    if ! sudo -u "$KIOSK_USER" git -C "$INSTALL_DIR" reset --hard origin/main 2>/dev/null; then
      sudo -u "$KIOSK_USER" git -C "$INSTALL_DIR" pull --ff-only || true
    fi
  else
    echo "Cloning repo into $INSTALL_DIR ..."
    mkdir -p "$INSTALL_DIR"
    chown "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR" || true
    # If directory exists and is not empty, back it up to avoid clone failure
    if [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
      backup="${INSTALL_DIR}.bak.$(date +%s)"
      echo "INSTALL_DIR not empty; moving to $backup"
      mv "$INSTALL_DIR" "$backup"
      mkdir -p "$INSTALL_DIR"
      chown "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR" || true
    fi
    sudo -u "$KIOSK_USER" git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"
  # Set safe permissions and ensure scripts are executable
  find "$INSTALL_DIR" -type d -exec chmod 755 {} + 2>/dev/null || true
  find "$INSTALL_DIR" -type f -exec chmod 644 {} + 2>/dev/null || true
  if [[ -d "$INSTALL_DIR/scripts" ]]; then
    chmod +x "$INSTALL_DIR"/scripts/*.sh 2>/dev/null || true
  fi
}

enable_kiosk_service() {
  if [[ "$MODE" == "server" ]]; then
    bash "$INSTALL_DIR/scripts/rpi-enable-kiosk.sh" server
  else
    bash "$INSTALL_DIR/scripts/rpi-enable-kiosk.sh" client "$CLIENT_URL"
  fi
}

# --- Interactive flow ---
read_mode
if [[ "$MODE" == "server" ]]; then
  read_server_inputs
else
  read_client_inputs
fi

# Ask about display pixel doubling (helps 1080p on 4K panels)
read_display_prefs

echo "\n== Installing packages =="
apt_install

echo "\n== Enabling SSH and VNC =="
enable_remote_access

echo "\n== Creating kiosk user and configuring autologin =="
setup_user_autologin

if [[ "$MODE" == "server" ]]; then
  echo "\n== Setting hostname =="
  set_hostname "$HOSTNAME_NEW"
fi

echo "\n== Fetching application =="
clone_repo

echo "\n== Desktop autologin (optional LightDM) =="
if [[ "${USE_LIGHTDM:-}" = "1" ]]; then
  echo "Enabling LightDM autologin for $KIOSK_USER (USE_LIGHTDM=1)"
  if [[ -x "$INSTALL_DIR/scripts/rpi-force-autologin.sh" ]]; then
    KIOSK_USER="$KIOSK_USER" KIOSK_PASSWORD="$KIOSK_PASSWORD" bash "$INSTALL_DIR/scripts/rpi-force-autologin.sh"
  else
    echo "force-autologin script not found in repo; fetching from GitHub..."
    curl -fsSL "https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-force-autologin.sh" | \
      KIOSK_USER="$KIOSK_USER" KIOSK_PASSWORD="$KIOSK_PASSWORD" bash
  fi
else
  echo "Skipping LightDM autologin (console+xinit kiosk will be used). Set USE_LIGHTDM=1 to enable."
fi

echo "\n== Setting boot splash (if image present) =="
if [[ "${SKIP_SPLASH:-}" = "1" ]]; then
  echo "Skipping boot splash configuration (SKIP_SPLASH=1)."
  # If an older splash is installed, proactively disable it for faster boots
  if [[ -x "$INSTALL_DIR/scripts/rpi-remove-splash.sh" ]]; then
    bash "$INSTALL_DIR/scripts/rpi-remove-splash.sh"
  fi
else
  if [[ -x "$INSTALL_DIR/scripts/rpi-set-splash.sh" ]]; then
    bash "$INSTALL_DIR/scripts/rpi-set-splash.sh" \
      "$INSTALL_DIR/resources/info.png"
  else
    curl -fsSL "https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-set-splash.sh" | \
      bash -s -- "$INSTALL_DIR/resources/info.png"
  fi
fi

echo "\n== Forcing 1080p resolution (best-effort) =="
if [[ -x "$INSTALL_DIR/scripts/rpi-set-resolution.sh" ]]; then
  PIXEL_DOUBLE="$PIXEL_DOUBLE" bash "$INSTALL_DIR/scripts/rpi-set-resolution.sh" 1920 1080
else
  curl -fsSL "https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-set-resolution.sh" | PIXEL_DOUBLE="$PIXEL_DOUBLE" bash -s -- 1920 1080
fi

echo "\n== Disabling sleep/screensaver =="
if [[ -x "$INSTALL_DIR/scripts/rpi-disable-sleep.sh" ]]; then
  bash "$INSTALL_DIR/scripts/rpi-disable-sleep.sh"
else
  curl -fsSL "https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-disable-sleep.sh" | bash -s --
fi

# Wallpaper configuration removed: kiosk runs without a desktop session

echo "\n== Enabling autostart service =="
enable_kiosk_service

echo "\nSetup complete. The kiosk will start after reboot."
read -rp "Reboot now? [y/N]: " answer || true
case "${answer:-}" in
  y|Y) systemctl reboot;;
  *) echo "You can reboot later with: sudo reboot";;
esac
