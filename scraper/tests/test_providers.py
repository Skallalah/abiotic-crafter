import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build import enemy_contents, merge_contents  # noqa: E402


def loot(obj: str, item: str, lo: str, hi: str) -> dict:
    return {"sourceObject": f"[[{obj}]]", "sourceEnemy": "", "item": item,
            "amountMin": lo, "amountMax": hi}


def table(set_name: str, item: str, lo: str, hi: str, chance: str) -> dict:
    return {"SetName": set_name, "ItemName": item,
            "QuantityMin": lo, "QuantityMax": hi, "Chance": chance}


def test_merge_contents_keeps_the_chance_cargo_alone_knows():
    """`Loot` donne les quantités, `LootTablesItems` la chance : une seule ligne."""
    merged = merge_contents([loot("Computer", "Case Fan", "1", "2")],
                            [table("Computer", "Case Fan", "1", "2", "1")], {})
    assert merged == {"Computer": [
        {"item": "Case Fan", "qtyMin": 1, "qtyMax": 2, "chance": 1.0},
    ]}


def test_merge_contents_folds_the_refrigerator_declared_twice():
    """`LootTables` déclare le set Refrigerator sur deux pages : 4 lignes en double."""
    rows = [table("Refrigerator", "Potato", "0", "1", "0.5")] * 2
    assert merge_contents([], rows, {}) == {"Refrigerator": [
        {"item": "Potato", "qtyMin": 0, "qtyMax": 1, "chance": 0.5},
    ]}


def test_merge_contents_takes_what_only_the_page_table_knows():
    """Onze caisses n'ont aucune ligne Cargo : leur contenu est dans leur page."""
    page = {"Office Wood Crate": [
        {"item": "Wood Plank", "qtyMin": 2, "qtyMax": 3, "chanceText": "100% of 2"},
    ]}
    assert merge_contents([], [], page) == {"Office Wood Crate": [
        {"item": "Wood Plank", "qtyMin": 2, "qtyMax": 3, "chanceText": "100% of 2"},
    ]}


def test_cargo_quantities_win_over_the_page_prose():
    """Le tableau de page complète Cargo, il ne le corrige pas."""
    page = {"Computer": [{"item": "Case Fan", "qtyMin": 9, "qtyMax": 9, "chance": 0.5}]}
    merged = merge_contents([loot("Computer", "Case Fan", "1", "2")], [], page)
    assert merged["Computer"] == [
        {"item": "Case Fan", "qtyMin": 1, "qtyMax": 2, "chance": 0.5},
    ]


def test_loot_alone_leaves_the_chance_unknown():
    merged = merge_contents([loot("Monitor", "Glass Scrap", "0", "2")], [], {})
    assert "chance" not in merged["Monitor"][0]


def test_enemy_contents_separates_drops_from_harvest():
    row = {"_pageName": "Pest", "name": "Pest",
           "drop1": "Bio Scrap", "harvest1": "Raw Pest", "harvest2": "Bio Scrap"}
    row |= {f"drop{i}": "" for i in range(2, 14)}
    row |= {f"harvest{i}": "" for i in range(3, 11)}
    assert enemy_contents([row]) == {"Pest": [
        {"item": "Bio Scrap", "via": "drop"},
        # Bio Scrap est déjà listé en drop : on ne le compte pas deux fois
        {"item": "Raw Pest", "via": "harvest"},
    ]}


def test_harvesting_a_corpse_is_a_kill_not_a_grow():
    """« Harvesting the remains of an Exor » : récolte de cadavre, pas culture."""
    from build import Report, fix_harvest_kinds

    providers = {"exor": {"kind": "enemy"}, "aloe": {"kind": "container"}}
    sources = {
        "quill": [
            {"kind": "drop", "zone": "Hydroplant", "target": "Exor", "targetId": "exor"},
            # déjà couverte par le drop zoné : élaguée
            {"kind": "grow", "target": "Exor", "targetId": "exor"},
        ],
        "skull": [
            # pas de drop zoné : requalifiée en drop
            {"kind": "grow", "target": "Exor", "targetId": "exor"},
        ],
        "leaf": [
            # une vraie plante reste une culture
            {"kind": "grow", "target": "Aloe", "targetId": "aloe"},
        ],
    }
    fix_harvest_kinds(sources, providers, Report())
    assert [s["kind"] for s in sources["quill"]] == ["drop"]
    assert sources["skull"][0]["kind"] == "drop"
    assert sources["leaf"][0]["kind"] == "grow"


def test_canonical_zone_follows_wiki_redirects(tmp_path, monkeypatch):
    """« Power Services » n'est pas une zone : sa page redirige vers Reactors."""
    import build
    import fetch_wikitext

    pages = {"Power Services": "#REDIRECT [[Reactors#Locations]]",
             "Reactors": "{{Sector}}\nDu contenu."}
    monkeypatch.setattr(fetch_wikitext, "read_page", lambda t: pages.get(t))
    build._zone_canon.clear()
    assert build.canonical_zone("Power Services") == "Reactors"
    assert build.canonical_zone("Reactors") == "Reactors"
    assert build.canonical_zone("Nulle Part") == "Nulle Part"
    build._zone_canon.clear()
