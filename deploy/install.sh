#!/usr/bin/env bash
set -euo pipefail

# Defaults (override with flags)
PORT=80
DATA_DIR="/opt/punters/data"
WITH_WATCHTOWER=0
IMAGE="ghcr.io/rafiki270/punters:latest" # Override with --image if needed

usage() {
  cat <<USAGE
Usage: $0 [--port <host_port>] [--data-dir </path>] [--watchtower] [--image <ghcr.io/org/repo:tag>]

Examples:
  $0 --port 8080 --data-dir /opt/punters/data
  $0 --watchtower --image ghcr.io/your-org/punters:latest
USAGE
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2;;
    --data-dir) DATA_DIR="${2:-}"; shift 2;;
    --watchtower) WITH_WATCHTOWER=1; shift;;
    --image) IMAGE="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

require_cmd() { command -v "$1" >/dev/null 2>&1; }

install_docker() {
  if require_cmd docker && docker compose version >/dev/null 2>&1; then
    echo "Docker and compose plugin already installed."
    return
  fi

  echo "Installing Docker (root required)…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker || true
  systemctl start docker || true

  if ! docker compose version >/dev/null 2>&1; then
    apt-get update -y || true
    apt-get install -y docker-compose-plugin || true
  fi
}

setup_compose() {
  mkdir -p /opt/punters
  mkdir -p "$DATA_DIR"

  cat >/opt/punters/.env <<EOF
HOST_PORT=$PORT
DATA_DIR=$DATA_DIR
IMAGE=$IMAGE
EOF

  cat >/opt/punters/docker-compose.yml <<'EOF'
services:
  punters:
    image: ${IMAGE:-ghcr.io/rafiki270/punters:latest}
    container_name: punters
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-80}:80"
    environment:
      - NODE_ENV=production
      - PORT=80
      - DATABASE_URL=file:/data/dev.db
    volumes:
      - ${DATA_DIR:-/opt/punters/data}:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:80/api/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
EOF

  if [[ "$WITH_WATCHTOWER" -eq 1 ]]; then
    cat >>/opt/punters/docker-compose.yml <<'EOF'

  watchtower:
    image: containrrr/watchtower
    container_name: punters-watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --cleanup --label-enable --interval 300
EOF
  fi
}

launch() {
  cd /opt/punters
  echo "Pulling image: $IMAGE"
  docker pull "$IMAGE" || true
  echo "Starting with docker compose…"
  docker compose up -d
  echo "Punters is up. Try: http://localhost:${PORT}"
}

# Main
install_docker
setup_compose
launch
