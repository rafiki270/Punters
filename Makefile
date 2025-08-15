SHELL := /bin/bash

.PHONY: help docker-build docker-toggle docker-publish-latest docker-release

.DEFAULT_GOAL := help

help: ## Show this help
	@awk 'BEGIN {FS=":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

docker-build: ## Build Docker images (Compose)
	docker compose build

docker-toggle: ## Toggle stack on host port 80 (start if stopped, stop if running)
	@set -e; \
	RUNNING=$$(docker compose --profile bridged ps -q punters 2>/dev/null || true); \
	if [ -n "$$RUNNING" ]; then \
	  echo "Stopping stack..."; \
	  docker compose down; \
	else \
	  echo "Starting stack on http://localhost:80 ..."; \
	  HOST_PORT=80 docker compose --profile bridged up -d; \
	fi

# Build and push multi-arch 'latest' image to GHCR and Docker Hub locally (requires buildx + logins)
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
