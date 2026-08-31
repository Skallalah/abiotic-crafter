"""Client HTTP unique du scraper.

Toute sortie réseau du projet passe par ici : c'est ce qui rend la contrainte
de la spec (1 requête/seconde, User-Agent, cache) structurelle plutôt que
déclarative.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlencode

import requests

API = "https://abioticfactor.wiki.gg/api.php"
INDEX = "https://abioticfactor.wiki.gg/index.php"
USER_AGENT = "af-recipes-scraper/1.0 (usage personnel)"

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CACHE = RAW / "http"

MIN_INTERVAL = 1.0          # secondes entre deux requêtes
RETRIES = 3


class Wiki:
    def __init__(self, force: bool = False) -> None:
        self.force = force
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self._last = 0.0
        self.requests_made = 0
        self.cache_hits = 0
        CACHE.mkdir(parents=True, exist_ok=True)

    # ---------- transport ----------

    def _throttle(self) -> None:
        wait = MIN_INTERVAL - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _cache_path(self, url: str, params: dict[str, Any]) -> Path:
        key = url + "?" + urlencode(sorted(params.items()))
        return CACHE / (hashlib.sha256(key.encode()).hexdigest() + ".cache")

    def get(self, url: str, params: dict[str, Any], *, binary: bool = False) -> bytes:
        """GET avec cache disque, throttle et retry. Renvoie le corps brut."""
        path = self._cache_path(url, params)
        if path.exists() and not self.force:
            self.cache_hits += 1
            return path.read_bytes()

        last_error: Exception | None = None
        for attempt in range(RETRIES):
            self._throttle()
            try:
                r = self.session.get(url, params=params, timeout=30)
            except requests.RequestException as exc:
                last_error = exc
            else:
                if r.status_code == 200:
                    self.requests_made += 1
                    path.write_bytes(r.content)
                    return r.content
                if r.status_code in (429,) or r.status_code >= 500:
                    last_error = RuntimeError(f"HTTP {r.status_code} sur {r.url}")
                else:
                    raise RuntimeError(f"HTTP {r.status_code} sur {r.url}")
            time.sleep(2 ** attempt)
        raise RuntimeError(f"échec après {RETRIES} tentatives : {last_error}")

    def api(self, **params: Any) -> dict:
        params.setdefault("format", "json")
        params.setdefault("formatversion", "2")
        return json.loads(self.get(API, params))

    def raw_page(self, title: str) -> str:
        """Wikitext brut d'une page via index.php?action=raw."""
        return self.get(INDEX, {"title": title, "action": "raw"}).decode("utf-8")

    def download(self, url: str, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self.get(url, {}, binary=True))

    # ---------- pagination ----------

    def cargo(self, table: str, fields: list[str], where: str | None = None,
              page_size: int = 500) -> list[dict]:
        """Interroge une table Cargo, en paginant par offset."""
        rows: list[dict] = []
        offset = 0
        while True:
            params = {
                "action": "cargoquery",
                "tables": table,
                "fields": ",".join(fields),
                "limit": page_size,
                "offset": offset,
            }
            if where:
                params["where"] = where
            batch = self.api(**params).get("cargoquery", [])
            rows.extend(r["title"] for r in batch)
            if len(batch) < page_size:
                return rows
            offset += page_size

    def query(self, **params: Any) -> Iterator[dict]:
        """Itère sur les pages d'un action=query en suivant `continue`."""
        params["action"] = "query"
        cont: dict[str, Any] = {}
        while True:
            data = self.api(**{**params, **cont})
            yield data.get("query", {})
            if "continue" not in data:
                return
            cont = data["continue"]
