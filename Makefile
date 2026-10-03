# VScout dev shortcuts. Every target runs in app/ with pnpm. `make` (or `make help`) lists them.
#
#   make dev     mock API (:8787) + app (:3000) together; Ctrl-C stops both
#   make phone   same, but reachable from a phone on your Wi-Fi (http://<LAN-IP>:3000)
#
# Sign in: alex (admin) or sam (scouter), password "correct horse 42"; guest code K7M2QX.

APP      := app
PNPM     := pnpm --dir $(APP)
LAN_IP   ?= $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1)
API_PORT ?= 8787
WEB_PORT ?= 3000

.DEFAULT_GOAL := help
.PHONY: help install dev phone mock mock-reset web broker broker-down stack preview check e2e

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36mmake %-12s\033[0m %s\n", $$1, $$2}'

install: ## Install app dependencies (pnpm)
	$(PNPM) install

# Runs the mock API in the background and the app in the foreground; the trap stops the mock on exit.
dev: ## Mock API + dev server on localhost
	@trap 'kill 0' INT TERM EXIT; \
	MOCK_API_PORT=$(API_PORT) $(PNPM) mock:api & \
	$(PNPM) exec vite dev --port $(WEB_PORT)

phone: ## Mock API + dev server on your LAN, for testing on a phone
	@test -n "$(LAN_IP)" || { echo "No LAN IP found; run: make phone LAN_IP=192.168.x.x"; exit 1; }
	@echo "Open http://$(LAN_IP):$(WEB_PORT) on your phone (same Wi-Fi)."
	@echo "Note: the dev server never registers the service worker, so there's no offline cache here."
	@trap 'kill 0' INT TERM EXIT; \
	MOCK_API_PORT=$(API_PORT) MOCK_API_CORS_ORIGIN=http://$(LAN_IP):$(WEB_PORT) $(PNPM) mock:api & \
	VITE_API_URL=http://$(LAN_IP):$(API_PORT)/api/v1 VITE_MQTT_URL=ws://$(LAN_IP):9001 \
	$(PNPM) exec vite dev --host 0.0.0.0 --port $(WEB_PORT)

mock: ## Mock API only (:8787)
	MOCK_API_PORT=$(API_PORT) $(PNPM) mock:api

mock-reset: ## Forget the mock API's saved state (accounts, scouting, chat, demo events)
	$(PNPM) mock:reset

web: ## Dev server only (:3000); needs `make mock` running
	$(PNPM) exec vite dev --port $(WEB_PORT)

broker: ## Start the local MQTT broker (Docker, :1883 / ws :9001)
	$(PNPM) stack:up

broker-down: ## Stop the local MQTT broker
	$(PNPM) stack:down

stack: broker dev ## Broker + mock API + dev server

# The production build calls a same-origin /api/v1 by default, so point it at the mock API.
preview: ## Production build + static server on :4173 (service worker, caching) + mock API
	VITE_API_URL=http://localhost:$(API_PORT)/api/v1 $(PNPM) build
	@trap 'kill 0' INT TERM EXIT; \
	MOCK_API_PORT=$(API_PORT) MOCK_API_CORS_ORIGIN=http://localhost:4173 $(PNPM) mock:api & \
	PORT=4173 node $(APP)/scripts/serve-static.mjs

check: ## Gate: typecheck, lint, unit tests
	$(PNPM) typecheck && $(PNPM) lint && $(PNPM) test

e2e: ## Build, then run the Playwright e2e suite
	$(PNPM) build && $(PNPM) test:e2e
