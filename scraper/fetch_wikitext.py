"""Étape 2 — wikitext des pages que Cargo ne couvre pas.

Cargo donne items, recettes, salvage et loot, mais aucune zone : la géographie
n'existe que dans la prose. On télécharge donc :
  - les pages secteur (section ==Items== structurée par sous-titres) ;
  - les pages de **tous** les items, pour `== Sources ==` et l'unlock ;
  - les pages des objets fouillables et des créatures, pour leur image et leur
    `== Locations ==` : une caisse n'a pas de ligne dans la table `Items`, donc
    pas de champ `image`, et sa fenêtre de détail n'aurait rien à montrer.

Le périmètre était limité aux items des recettes, mais build.py fait aussi
entrer dans le dataset les objets dont un item dérive (démonter un extincteur
donne une Canister) : ceux-là se retrouvaient sans page, donc sans source ni
lieu. Les lots de 50 via action=query&prop=revisions ramènent les 1 622 pages à
une trentaine de requêtes, ce qui rend le ciblage inutile.
"""

from __future__ import annotations

import argparse
import json

from fetch_cargo import load
from parse import parse_sector, strip_links
from wiki import RAW, Wiki

PAGES_DIR = RAW / "pages"
SECTORS_FILE = RAW / "sectors.json"
BATCH = 50


def sector_titles(wiki: Wiki) -> list[str]:
    """Pages de l'espace principal transcluant Template:Sector."""
    titles: list[str] = []
    for chunk in wiki.query(list="embeddedin", eititle="Template:Sector",
                            einamespace=0, eilimit=500):
        titles += [p["title"] for p in chunk.get("embeddedin", [])]
    return sorted(titles)


def item_titles() -> list[str]:
    """Titres de toutes les pages items connues de Cargo."""
    return sorted({r["_pageName"] for r in load("Items")})


def object_titles(sectors: list[str]) -> list[str]:
    """Titres des objets fouillables et des créatures, toutes provenances.

    Les quatre listes se recoupent largement ; l'union tient en trois lots de
    50. Les titres inexistants (« Wooden Crate (double) » n'a pas de page)
    reviennent `missing` et sont simplement ignorés.
    """
    titles: set[str] = set()

    for row in load("Objects"):
        name = strip_links(row.get("name") or "").strip()
        if name:
            titles.add(name)
        # « Destroyable Objects » / « Pickup Objects » : la page de synthèse, vers
        # laquelle plusieurs caisses ne sont qu'une redirection
        page = (row.get("_pageName") or "").strip()
        if page:
            titles.add(page)

    for row in load("LootTables"):
        page = (row.get("_pageName") or "").strip()
        # « Data:ContainerLoot » et « User:… » sont des pages de données, pas
        # des objets : elles n'ont ni image ni emplacement.
        if page and ":" not in page:
            titles.add(page)

    for row in load("Enemies"):
        page = (row.get("_pageName") or "").strip()
        if page:
            titles.add(page)

    # les « Resource Nodes » des pages secteur rattrapent les caisses absentes
    # de Cargo : Office Wood Crate, ASO Wood Crate, Reactors Wood Crate…
    for title in sectors:
        titles.update(parse_sector(read_page(title) or "").get("node", []))

    return sorted(titles)


def fetch_pages(wiki: Wiki, titles: list[str]) -> int:
    """Écrit data/raw/pages/<title>.wikitext. Renvoie le nombre de pages vues."""
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    seen = 0
    for start in range(0, len(titles), BATCH):
        batch = titles[start:start + BATCH]
        for chunk in wiki.query(prop="revisions", rvprop="content|ids",
                                rvslots="main", titles="|".join(batch)):
            for page in chunk.get("pages", []):
                if "missing" in page or not page.get("revisions"):
                    continue
                rev = page["revisions"][0]
                text = rev["slots"]["main"]["content"]
                header = f"<!-- revid={rev['revid']} -->\n"
                path = PAGES_DIR / (safe_name(page["title"]) + ".wikitext")
                path.write_text(header + text)
                seen += 1
    return seen


def safe_name(title: str) -> str:
    return title.replace("/", "%2F").replace(" ", "_")


def read_page(title: str) -> str | None:
    """Wikitext en cache d'une page, sans l'en-tête revid."""
    path = PAGES_DIR / (safe_name(title) + ".wikitext")
    if not path.exists():
        return None
    text = path.read_text()
    return text.split("\n", 1)[1] if text.startswith("<!-- revid=") else text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="ignore le cache HTTP")
    args = ap.parse_args()

    wiki = Wiki(force=args.force)

    sectors = sector_titles(wiki)
    SECTORS_FILE.write_text(json.dumps(sectors, indent=1, ensure_ascii=False))
    print(f"secteurs : {len(sectors)} → {', '.join(sectors)}")

    # les secteurs d'abord : leurs listes de nœuds nomment des objets à charger
    fetch_pages(wiki, sectors)

    items = item_titles()
    objects = object_titles(sectors)
    print(f"pages items : {len(items)}")
    print(f"pages objets et créatures : {len(objects)}")

    n = fetch_pages(wiki, sorted(set(items) | set(objects)))
    print(f"{n} pages écrites dans {PAGES_DIR}")
    print(f"{wiki.requests_made} requêtes, {wiki.cache_hits} depuis le cache")


if __name__ == "__main__":
    main()
