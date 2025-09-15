SHELL := /bin/bash
HOST_PORT ?= 80

.PHONY: help install dev dev-web build start \
  kioskpi prisma-generate prisma-migrate db-seed \
  docker-build docker-up docker-down docker-logs \
  launch launch80 launch-client update \
  pi-setup pi-launch pi-launch-client \
  pi-force-autologin \
  check-api docker-toggle docker-publish-latest docker-release

.DEFAULT_GOAL := help

help: ## Show this help
	@awk 'BEGIN {FS=":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install dependencies (root + web)
	npm install
	@echo "Installing web dependencies..."
	@npm --prefix web install

prisma-generate: ## Generate Prisma client
	npm run prisma:generate

prisma-migrate: ## Run Prisma migrations (dev)
	npm run prisma:migrate

db-seed: ## Seed defaults (sizes, settings)
	npm run db:seed

dev: ## Run server in dev mode on port 3000
	npm run dev

dev-web: ## Run web dev server on port 5173
	npm run dev:web

build: ## Build web and server
	npm run build

start: ## Start built server (serves built web)
	npm start

kioskpi: ## Run server and Chromium in kiosk mode on Raspberry Pi
	./scripts/pi-kiosk.sh

# Raspberry Pi: setup and autostart kiosk (server/client)
pi-setup: ## Raspberry Pi: create kiosk user, install deps, enable SSH/VNC, autologin
	@echo "Running Raspberry Pi setup (requires sudo)..." && \
	sudo bash scripts/rpi-setup.sh

pi-launch: ## Raspberry Pi: install to /opt and autostart server + fullscreen browser at boot
	@echo "Enabling kiosk autostart (server mode) ..." && \
	sudo bash scripts/rpi-enable-kiosk.sh server

pi-launch-client: ## Raspberry Pi: autostart fullscreen browser to URL at boot (no local server); pass URL=...
	@if [ -z "$(URL)" ]; then echo "Set URL, e.g. make pi-launch-client URL=http://server.local"; exit 1; fi
	@echo "Enabling kiosk autostart (client mode) -> $(URL) ..." && \
	sudo bash scripts/rpi-enable-kiosk.sh client "$(URL)"

pi-force-autologin: ## Raspberry Pi: force GUI + TTY autologin to kiosk user (no password)
	@echo "Forcing autologin to kiosk (requires sudo)..." && \
	sudo bash scripts/rpi-force-autologin.sh

# Convenience alias matching requested wording
launch-client: pi-launch-client ## Alias: make launch-client URL=...

docker-build: ## Build Docker images (Compose, bridged profile)
	docker compose --profile bridged build

docker-up: ## Run stack on host port $(HOST_PORT) (bridged profile)
	HOST_PORT=$(HOST_PORT) docker compose --profile bridged up -d --build

docker-down: ## Stop stack (bridged profile)
	docker compose --profile bridged down

docker-logs: ## Tail Docker logs (bridged profile)
	docker compose --profile bridged logs -f punters

launch: ## One-shot dev: installs deps (unless SKIP_INSTALL=1), prepares DB, runs web+server
	@if [ ! -f .env ]; then \
		echo ".env not found. Copying from .env.example"; \
		cp .env.example .env; \
	fi
	@if [ -z "$$SKIP_INSTALL" ]; then \
		echo "Ensuring root dependencies..."; \
		npm install; \
		echo "Ensuring web dependencies..."; \
		npm --prefix web install; \
	else \
		echo "Skipping dependency install (SKIP_INSTALL=1)"; \
	fi
	@echo "Generating Prisma client..." && npm run -s prisma:generate
	@echo "Applying Prisma migrations (dev)..." && npm run -s prisma:migrate
	@echo "Seeding defaults (idempotent)..." && npm run -s db:seed
	@echo "Detecting LAN IPs..."
	@IPS=$$(ifconfig 2>/dev/null | awk '/inet / && $$2 != "127.0.0.1" {print $$2}'); \
	if [ -n "$$IPS" ]; then \
	  echo "Access on LAN:"; \
	  for ip in $$IPS; do \
	    echo "  - $$ip (Display: http://$$ip:5173  API: http://$$ip:3000)"; \
	  done; \
	else \
	  echo "No non-loopback IPv4 detected. You can still use http://localhost:5173 and http://localhost:3000"; \
	fi
	@echo "Cleaning Vite cache (web/node_modules/.vite)..." && rm -rf web/node_modules/.vite 2>/dev/null || true
	@echo "Starting web dev server (5173) and API (3000)..."
	@npm run -s dev:web & \
	server_pid=$$!; \
	npm run -s dev; \
	kill $$server_pid 2>/dev/null || true; \
                wait $$server_pid 2>/dev/null || true

launch80: ## One-shot dev on web port 80: installs deps (unless SKIP_INSTALL=1), prepares DB, runs web+server
	@if [ ! -f .env ]; then \
	echo ".env not found. Copying from .env.example"; \
	cp .env.example .env; \
	fi
	@if [ -z "$$SKIP_INSTALL" ]; then \
	echo "Ensuring root dependencies..."; \
	npm install; \
	echo "Ensuring web dependencies..."; \
	npm --prefix web install; \
	else \
	echo "Skipping dependency install (SKIP_INSTALL=1)"; \
	fi
	@echo "Generating Prisma client..." && npm run -s prisma:generate
	@echo "Applying Prisma migrations (dev)..." && npm run -s prisma:migrate
	@echo "Seeding defaults (idempotent)..." && npm run -s db:seed
	@echo "Detecting LAN IPs..."
	@IPS=$$(ifconfig 2>/dev/null | awk '/inet / && $$2 != "127.0.0.1" {print $$2}'); \
	if [ -n "$$IPS" ]; then \
	  echo "Access on LAN:"; \
	  for ip in $$IPS; do \
	    echo "  - $$ip (Display: http://$$ip:80  API: http://$$ip:3000)"; \
	  done; \
	else \
	  echo "No non-loopback IPv4 detected. You can still use http://localhost and http://localhost:3000"; \
	fi
	@echo "Cleaning Vite cache (web/node_modules/.vite)..." && rm -rf web/node_modules/.vite 2>/dev/null || true
	@echo "Starting web dev server (80, host=0.0.0.0) and API (3000)..."
	@(cd web && npx vite --host --port 80) & \
	server_pid=$$!; \
	npm run -s dev; \
	kill $$server_pid 2>/dev/null || true; \
	wait $$server_pid 2>/dev/null || true

update: ## Pull latest code, install deps, run Prisma generate+migrate, and build (optional RESTART=1 to restart systemd kiosk)
	@echo "Pulling latest from git..." && git pull --ff-only || true
	@if [ -z "$$SKIP_INSTALL" ]; then \
	  echo "Installing root dependencies..."; npm install; \
	  echo "Installing web dependencies..."; npm --prefix web install; \
	else \
	  echo "Skipping dependency install (SKIP_INSTALL=1)"; \
	fi
	@echo "Generating Prisma client..." && npm run -s prisma:generate
	@echo "Applying Prisma migrations..." && npm run -s prisma:migrate
	@echo "Building project..." && npm run -s build
	@if [ -n "$$RESTART" ]; then \
	  if command -v systemctl >/dev/null 2>&1; then \
	    echo "Restarting punters-kiosk.service..."; \
	    sudo systemctl restart punters-kiosk.service || true; \
	  fi; \
	else \
	  echo "If running on Raspberry Pi kiosk, set RESTART=1 to restart the service."; \
	fi

check-api: ## Quick API checks on 3000 and 5173 (proxy)
	@echo "Checking API on :3000 (direct)" && \
	curl -sf http://localhost:3000/api/health && echo || echo "Fail"
	@echo "Mode:" && curl -sf http://localhost:3000/api/mode && echo || true
	@echo "Settings (direct):" && curl -sf http://localhost:3000/api/settings | head -c 200 && echo || true
	@echo "Beerlist (direct):" && curl -sf http://localhost:3000/api/display/beerlist && echo || true
	@echo "Checking API via :5173 proxy" && \
	curl -sf http://localhost:5173/api/health && echo || echo "Proxy fail"
	@echo "Mode (proxy):" && curl -sf http://localhost:5173/api/mode && echo || true
	@echo "Settings (proxy):" && curl -sf http://localhost:5173/api/settings | head -c 200 && echo || true

# Docker convenience: toggle stack on host port 80
docker-toggle: ## Toggle stack on host port $(HOST_PORT) (bridged profile)
	@set -e; \
	RUNNING=$$(docker compose --profile bridged ps -q punters 2>/dev/null || true); \
	if [ -n "$$RUNNING" ]; then \
	  echo "Stopping stack..."; \
	  docker compose --profile bridged down; \
	else \
	  echo "Starting stack on http://localhost:$(HOST_PORT) ..."; \
	  HOST_PORT=$(HOST_PORT) docker compose --profile bridged up -d --build; \
	fi

# Build and push multi-arch 'latest' image to GHCR + Docker Hub locally (requires buildx + logins)
docker-publish-latest: ## Buildx push latest to GHCR + Docker Hub (amd64, arm64)
	@docker buildx version >/dev/null 2>&1 || { echo "docker buildx not available"; exit 1; }
	@echo "Ensure you're logged in: ghcr.io (with GHCR_TOKEN) and Docker Hub (DOCKERHUB)";
	docker buildx create --name puntersbx --use >/dev/null 2>&1 || true
	docker buildx build \
	  --platform linux/amd64,linux/arm64 \
	  -t ghcr.io/rafiki270/punters:latest \
	  -t docker.io/rafiki270/punters:latest \
	  --push .

# Tag and push a release to trigger GH Actions multi-arch publish (VERSION=vX.Y.Z)
docker-release: ## Tag git with VERSION and push (triggers CI release)
	@if [ -z "$$VERSION" ]; then echo "Set VERSION, e.g. make docker-release VERSION=v1.2.3"; exit 1; fi
	@git tag -a "$$VERSION" -m "Release $$VERSION" || true
	@git push origin "$$VERSION"
