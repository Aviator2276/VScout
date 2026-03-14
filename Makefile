.PHONY: init run migrate makemigrations check shell frontend backend qcluster import-tba update-rankings generate-competition comp-setup comp-reset download-match-videos ocr-scores comp-day1 comp-day2 comp-select-1 comp-select-2 comp-select-3 comp-quarters comp-semis comp-finals createsuperuser init_gacmp comp-setup-gacmp comp-setup-2026week0 comp-setup-2026gadal dev-reset-2026week0 export-cookies redownload-videos reclip-videos attribute-fuel docker-build docker-run offsite-run

init:
	@echo "Installing backend dependencies..."
	cd vibescout_backend && uv sync
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Dependencies installed successfully!"

createsuperuser:
	@echo "Creating admin user (username: admin, password: admin)..."
	cd vibescout_backend && echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | uv run python manage.py shell
	@echo "Admin user created successfully!"

backend:
	cd vibescout_backend && uv run python manage.py runserver

collectstatic:
	cd vibescout_backend && uv run python manage.py collectstatic --noinput

frontend:
	cd frontend && npm start

run:
	@echo "Starting backend, frontend, and qcluster worker concurrently..."
	@make -j3 backend frontend qcluster

export:
	cd frontend && npm run build:web

frontend-prod:
	cd frontend && npm run serve

run-prod:
	@echo "Starting backend, frontend, and qcluster worker concurrently..."
	@make -j3 backend frontend-prod qcluster

migrate:
	cd vibescout_backend && uv run python manage.py migrate

makemigrations:
	cd vibescout_backend && uv run python manage.py makemigrations

qcluster:
	cd vibescout_backend && uv run python manage.py qcluster

check:
	cd vibescout_backend && uv run python manage.py check

shell:
	cd vibescout_backend && uv run python manage.py shell

import-tba:
	cd vibescout_backend && uv run python manage.py import_tba_events 2026week0

comp-setup-2026week0:
	@echo "Initializing 2026week0 competition (Real Event, Blank Matches)..."
	cd vibescout_backend && uv run python manage.py init_competition 2026week0 --stream-time-day-1 2117 --stream-link-day-1 "https://www.youtube.com/watch?v=eUdvSJ-mqtU"
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches 2026week0

comp-setup:
	@echo "Initializing $(COMP) competition (Real Event, Blank Matches)..."
	cd vibescout_backend && uv run python manage.py init_competition $(COMP)
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches $(COMP)
	@echo "Done! Add stream links and first match video position in the Django admin."

comp-setup-2026gadal:
	@echo "Initializing 2026gadal competition (Real Event, Blank Matches)..."
	cd vibescout_backend && uv run python manage.py init_competition 2026gadal
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches 2026gadal
	@echo "Done! Add stream links and first match video position in the Django admin."

comp-reset:
	@echo "Resetting database (deleting all data)..."
	cd vibescout_backend && uv run python manage.py reset_database

dev-reset-2026week0:
	@echo "Resetting database..."
	rm -f vibescout_backend/db.sqlite3
	@echo "Clearing match videos..."
	rm -rf vibescout_backend/match_videos/2026week0
	@echo "Running migrations..."
	cd vibescout_backend && uv run python manage.py migrate
	@echo "Creating admin user..."
	cd vibescout_backend && echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists() or User.objects.create_superuser('admin', 'admin@example.com', 'admin')" | uv run python manage.py shell
	@echo "Initializing 2026week0 competition..."
	cd vibescout_backend && uv run python manage.py init_competition 2026week0 --stream-time-day-1 2117 --stream-link-day-1 "https://www.youtube.com/watch?v=eUdvSJ-mqtU"
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches 2026week0
	@echo "Done! Ready to run."

download-match-videos:
	cd vibescout_backend && uv run python manage.py download_match_videos $(COMP)

redownload-videos:
	cd vibescout_backend && uv run python manage.py redownload_videos $(COMP) $(if $(MATCH),--match $(MATCH),)

reclip-videos:
	cd vibescout_backend && uv run python manage.py reclip_videos $(COMP) $(if $(MATCH),--match $(MATCH),)

attribute-fuel:
	cd vibescout_backend && uv run python manage.py attribute_fuel $(if $(COMP),$(COMP),)

offsite-run:
	cd vibescout_backend && uv run python manage.py process_offsite \
		--server $(or $(SERVER),$(shell grep OFFSITE_SERVER_URL .env | cut -d= -f2)) \
		--key $(or $(KEY),$(shell grep OFFSITE_API_KEY .env | cut -d= -f2)) \
		$(if $(COMP),--competition $(COMP),) \
		$(if $(MATCH),--match-number $(MATCH),) \
		$(if $(KEEP_TEMP),--keep-temp,)

docker-build:
	docker build -t vibescout-backend ./vibescout_backend

docker-run:
	docker run -p 8000:8000 \
		-v $(PWD)/vibescout_backend/db.sqlite3:/app/db.sqlite3 \
		-v $(PWD)/vibescout_backend/match_videos:/app/match_videos \
		--env-file vibescout_backend/.env \
		vibescout-backend
