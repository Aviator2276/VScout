.PHONY: init run migrate makemigrations check shell frontend backend qcluster import-tba update-rankings generate-competition comp-setup comp-reset download-match-videos ocr-scores comp-day1 comp-day2 comp-select-1 comp-select-2 comp-select-3 comp-quarters comp-semis comp-finals createsuperuser init_gacmp comp-setup-gacmp comp-setup-2026week0 dev-reset-2026week0 export-cookies

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
	cd vibescout_backend && uv run python manage.py import_tba_events 2026week0

update-rankings:
	cd vibescout_backend && uv run python manage.py update_rankings 2025gacmp

generate-competition:
	@echo "Generating competition and playing all matches..."
	cd vibescout_backend && uv run python manage.py generate_competition

comp-setup-2026week0:
	@echo "Initializing 2026week0 competition (Real Event, Blank Matches)..."
	cd vibescout_backend && uv run python manage.py init_competition 2026week0 --stream-time-day-1 2117 --stream-link-day-1 "https://www.youtube.com/watch?v=eUdvSJ-mqtU"
	@echo "Adding blank matches..."
	cd vibescout_backend && uv run python manage.py add_blank_matches 2026week0

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

export-cookies:
	cd vibescout_backend && uv run yt-dlp --cookies-from-browser firefox --cookies ../cookies.txt --skip-download "https://www.youtube.com/watch?v=eUdvSJ-mqtU"
	@echo "Cookies saved to cookies.txt"

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
