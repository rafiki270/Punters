SHELL := /bin/bash

.PHONY: help install dev dev-web build start prisma-generate prisma-migrate db-seed docker-build docker-up docker-down docker-logs launch check-api

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

docker-build: ## Build Docker image
	docker compose build

docker-up: ## Run stack with Docker Compose
	docker compose up --build

docker-down: ## Stop stack
	docker compose down

docker-logs: ## Tail Docker logs
	docker compose logs -f


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
	@echo "Starting web dev server (5173) and API (3000)..."
	@npm run -s dev:web & \
	server_pid=$$!; \
	npm run -s dev; \
	kill $$server_pid 2>/dev/null || true; \
		wait $$server_pid 2>/dev/null || true

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
