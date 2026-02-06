.PHONY: init run migrate makemigrations check shell frontend backend qcluster import-tba update-rankings generate-competition comp-setup comp-reset download-match-videos ocr-scores comp-day1 comp-day2 comp-select-1 comp-select-2 comp-select-3 comp-quarters comp-semis comp-finals

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
	@echo "Starting backend, frontend, and qcluster worker concurrently..."
	@make -j3 backend frontend qcluster

migrate:
	cd vibescout_backend && uv run python manage.py migrate

makemigrations:
	cd vibescout_backend && uv run python manage.py makemigrations

check:
	cd vibescout_backend && uv run python manage.py check

shell:
	cd vibescout_backend && uv run python manage.py shell

qcluster:
	cd vibescout_backend && uv run python manage.py qcluster

import-tba:
	cd vibescout_backend && uv run python manage.py import_tba_events 2020gagai 2020gadal 2025gacmp

update-rankings:
	cd vibescout_backend && uv run python manage.py update_rankings 2025gacmp

generate-competition:
	@echo "Generating competition and playing all matches..."
	cd vibescout_backend && uv run python manage.py generate_competition

comp-setup:
	@echo "Setting up competition WITHOUT playing matches (for step-through)..."
	cd vibescout_backend && uv run python manage.py setup_competition

comp-reset:
	@echo "Resetting database (deleting all data)..."
	cd vibescout_backend && uv run python manage.py reset_database

download-match-videos:
	cd vibescout_backend && uv run python manage.py download_match_videos 2025gacmp --output-dir ../match_videos

export:
	cd frontend && npm run build:web

ocr-scores:
	cd vibescout_backend/score_ocr && uv run python score_ocr.py

# Competition Step-Through Commands
comp-day1:
	@echo "=== Playing Day 1 Matches (First Half of Qualifications) ==="
	cd vibescout_backend && uv run python manage.py step_competition day1

comp-day2:
	@echo "=== Playing Day 2 Matches (Second Half of Qualifications) ==="
	cd vibescout_backend && uv run python manage.py step_competition day2

comp-select-1:
	@echo "=== Alliance Selection Round 1 ==="
	cd vibescout_backend && uv run python manage.py step_competition select-alliances-1

comp-select-2:
	@echo "=== Alliance Selection Round 2 ==="
	cd vibescout_backend && uv run python manage.py step_competition select-alliances-2

comp-select-3:
	@echo "=== Alliance Selection Round 3 (Final) ==="
	cd vibescout_backend && uv run python manage.py step_competition select-alliances-3

comp-quarters:
	@echo "=== Playing Quarterfinal Matches ==="
	cd vibescout_backend && uv run python manage.py step_competition quarterfinals

comp-semis:
	@echo "=== Playing Semifinal Matches ==="
	cd vibescout_backend && uv run python manage.py step_competition semifinals

comp-finals:
	@echo "=== Playing Finals Matches ==="
	cd vibescout_backend && uv run python manage.py step_competition finals
