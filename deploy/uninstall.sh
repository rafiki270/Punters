#!/usr/bin/env bash
set -euo pipefail

cd /opt/punters 2>/dev/null || { echo "/opt/punters not found"; exit 0; }
echo "Stopping containers…"
docker compose down || true
echo "Removing /opt/punters…"
rm -rf /opt/punters
echo "Removed."

