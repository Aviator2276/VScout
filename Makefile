.PHONY: run migrate check shell

run:
	cd vibescout_backend && uv run python manage.py runserver

migrate:
	cd vibescout_backend && uv run python manage.py migrate

check:
	cd vibescout_backend && uv run python manage.py check

shell:
	cd vibescout_backend && uv run python manage.py shell
