"""Étape 1 — dump brut des tables Cargo dans data/raw/cargo/.

Le wiki expose bien Cargo (action=cargoquery répond) même si l'extension
n'apparaît pas dans siteinfo. Les tables couvrent items, recettes, stack,
salvage et loot ; seules les zones manquent (cf. fetch_wikitext.py).
"""

from __future__ import annotations

import argparse
import json
import sys

from wiki import RAW, Wiki

CARGO_DIR = RAW / "cargo"

# table -> colonnes demandées. _pageName est systématiquement ajouté.
TABLES: dict[str, list[str]] = {
    "Items": [
        "name", "image", "category", "weight", "stackSize",
        "researchMaterial", "tier", "description", "gearSlot",
              # chaînes de cuisson, de découpe et de décomposition (§4 étape 1)
              "cookingCookedItem", "cookingPortionItem", "decayToItem"],
    "Recipes": [
        "resultItem", "resultAmount", "requiredStation",
        "ingredient1Item", "ingredient1Amount",
        "ingredient2Item", "ingredient2Amount",
        "ingredient3Item", "ingredient3Amount",
        "ingredient4Item", "ingredient4Amount",
    ],
    "UpgradeRecipes": [
        "baseItem", "resultItem",
        "ingredient1Item", "ingredient1Amount",
        "ingredient2Item", "ingredient2Amount",
        "ingredient3Item", "ingredient3Amount",
        "ingredient4Item", "ingredient4Amount",
    ],
    "ChemistryRecipes": [
        "resultItem", "resultAmount",
        "ingredient1Item", "ingredient1Amount",
        "ingredient2Item", "ingredient2Amount",
        "ingredient3Item", "ingredient3Amount",
    ],
    "DistillRecipes": ["resultItem", "resultAmount", "ingredient"],
    "SoupRecipes": [
        "resultItem", "resultAmount",
        "ingredient1Item", "ingredient2Item", "ingredient3Item",
    ],
    "Loot": ["sourceType", "sourceEnemy", "sourceObject", "item", "amountMin", "amountMax"],
    "LootTables": ["SetName", "Image", "BaseItem", "Type"],
    "LootTablesItems": ["SetName", "ItemName", "QuantityMin", "QuantityMax", "Chance"],
    "ItemScrapingResults": ["item", "result", "amountMin", "amountMax"],
    "Enemies": ["name", "type", "origin"] + [f"drop{i}" for i in range(1, 14)]
                                          + [f"harvest{i}" for i in range(1, 11)],
    "Objects": ["name", "type"],
}


def load(table: str) -> list[dict]:
    """Relit un dump déjà écrit. Utilisé par build.py et par les tests."""
    path = CARGO_DIR / f"{table}.json"
    if not path.exists():
        sys.exit(f"{path} absent — lancer d'abord `python scraper/fetch_cargo.py`")
    return json.loads(path.read_text())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="ignore le cache HTTP")
    args = ap.parse_args()

    wiki = Wiki(force=args.force)
    CARGO_DIR.mkdir(parents=True, exist_ok=True)

    for table, fields in TABLES.items():
        rows = wiki.cargo(table, ["_pageName"] + fields)
        (CARGO_DIR / f"{table}.json").write_text(
            json.dumps(rows, indent=1, ensure_ascii=False)
        )
        print(f"{table:22s} {len(rows):5d} lignes")

    print(f"\n{wiki.requests_made} requêtes, {wiki.cache_hits} depuis le cache")


if __name__ == "__main__":
    main()
