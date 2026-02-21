.PHONY: init run migrate makemigrations check shell frontend backend qcluster import-tba update-rankings generate-competition comp-setup comp-reset download-match-videos ocr-scores comp-day1 comp-day2 comp-select-1 comp-select-2 comp-select-3 comp-quarters comp-semis comp-finals createsuperuser init_gacmp comp-setup-gacmp

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

comp-setup-gacmp:
	@echo "Initializing 2025gacmp competition (Real Event, Blank Matches)..."
	cd vibescout_backend && uv run python manage.py init_competition 2025gacmp --stream-time-day-1 1743699901 --stream-time-day-2 1743769816 --stream-time-day-3 1743856286 --stream-link-day-1 "https://www.youtube.com/watch?v=p-CZ4LRTTqQ" --stream-link-day-2 "https://www.youtube.com/watch?v=TJuzMzMi-g4&pp=2AaxDA%3D%3D" --stream-link-day-3 "https://www.youtube.com/watch?v=0oHvm-ZECB0"
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches 2025gacmp

init_gacmp: comp-setup-gacmp

comp-reset:
	@echo "Resetting database (deleting all data)..."
	cd vibescout_backend && uv run python manage.py reset_database

download-match-videos:
	cd vibescout_backend && uv run python manage.py download_match_videos $(COMP)

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
