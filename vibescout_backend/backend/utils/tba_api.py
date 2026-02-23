"""
TBA (The Blue Alliance) API client using requests.
Replaces tbapy for 2026+ compatibility.
"""

import requests

TBA_BASE_URL = "https://www.thebluealliance.com/api/v3"


class TBAClient:
    def __init__(self, api_key: str):
        self.session = requests.Session()
        self.session.headers.update({"X-TBA-Auth-Key": api_key})

    def _get(self, endpoint: str):
        url = f"{TBA_BASE_URL}{endpoint}"
        response = self.session.get(url)
        response.raise_for_status()
        return response.json()

    def event(self, event_key: str) -> dict:
        return self._get(f"/event/{event_key}")

    def event_teams(self, event_key: str, simple: bool = False) -> list:
        suffix = "/simple" if simple else ""
        return self._get(f"/event/{event_key}/teams{suffix}")

    def event_matches(self, event_key: str) -> list:
        return self._get(f"/event/{event_key}/matches")

    def event_rankings(self, event_key: str) -> dict:
        return self._get(f"/event/{event_key}/rankings")

    def match(self, match_key: str) -> dict:
        return self._get(f"/match/{match_key}")
