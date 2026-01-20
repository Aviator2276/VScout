.PHONY: run migrate makemigrations check shell

run:
	cd vibescout_backend && uv run python manage.py runserver

migrate:
	cd vibescout_backend && uv run python manage.py migrate

makemigrations:
	cd vibescout_backend && uv run python manage.py makemigrations

check:
	cd vibescout_backend && uv run python manage.py check

shell:
	cd vibescout_backend && uv run python manage.py shell
