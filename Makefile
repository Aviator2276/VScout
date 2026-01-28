.PHONY: init run migrate makemigrations check shell frontend backend import-tba generate-competition download-match-videos

init:
	@echo "Installing backend dependencies..."
	cd vibescout_backend && uv sync
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Dependencies installed successfully!"

backend:
	cd vibescout_backend && uv run python manage.py runserver

collectstatic:
	cd vibescout_backend && uv run python manage.py collectstatic --noinput

frontend:
	cd frontend && npm start

run:
	@echo "Starting backend and frontend concurrently..."
	@make -j2 backend frontend

migrate:
	cd vibescout_backend && uv run python manage.py migrate

makemigrations:
	cd vibescout_backend && uv run python manage.py makemigrations

check:
	cd vibescout_backend && uv run python manage.py check

shell:
	cd vibescout_backend && uv run python manage.py shell

import-tba:
	cd vibescout_backend && uv run python manage.py import_tba_events 2020gagai 2020gadal 2025gacmp

generate-competition:
	cd vibescout_backend && uv run python manage.py generate_competition

download-match-videos:
	cd vibescout_backend && uv run python manage.py download_match_videos 2025gacmp --output-dir ../match_videos

export:
	cd frontend && npm run build:web