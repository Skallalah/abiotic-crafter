"""Étape 3 — assemble data/scraped.json à partir des bruts de data/raw/.

Ne fait aucune requête réseau en dehors du téléchargement des icônes. Se
termine par un rapport ; échoue si un ingrédient de recette ne résout vers
aucun item.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

import fetch_wikitext
from fetch_cargo import load
from colors import dominant_color
from parse import (
    link_targets, normalize_name, parse_drop_table, parse_infobox_image, parse_locations,
    parse_object_images, parse_person_zones, parse_sector, parse_sector_enemies,
    parse_sector_links, parse_sector_portal_worlds, parse_sources, parse_unlock,
    parse_zone_icon, parse_zone_items, slugify, strip_links, zone_mentions,
)
from wiki import RAW, ROOT, Wiki

DATA = ROOT / "data"
ICONS = DATA / "icons"
OUT = DATA / "scraped.json"
NEEDS_REVIEW = RAW / "needs_review.txt"

# Le wiki n'expose nulle part l'ordre de progression ; il est fixé ici à la main
# (cf. DECISIONS.md). Toute zone inconnue est ajoutée à la suite avec un warning.
ZONE_ORDER = [
    "Office Sector",
    "Manufacturing West",
    "Cascade Laboratories",
    "Hydroplant",
    "Security Sector",
    "Reactors",
    "Residence Sector",
    "The Encroachment",
    "Fragments",
]

# tables de craft autres que Recipes : bench fixe, ingrédients sans quantité
EXTRA_CRAFT_TABLES = {
    "ChemistryRecipes": ("Chemistry Station", 3, True),
    "SoupRecipes": ("Chef's Counter", 3, False),
}

MAX_SALVAGE = 6

# `Objects.type` et `LootTables.Type` nomment la même chose différemment
PROVIDER_KINDS = {
    "destroyable": "destroyable",
    "pickup": "pickup",
    "container": "container",
    "salvaging": "salvage",
    "butchering": "butcher",
}

CATEGORY_FIXES = {"": "Divers", "farming": "Farming"}


class Report:
    def __init__(self) -> None:
        self.warnings: list[str] = []
        self.counts: dict[str, int] = {}

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def bump(self, key: str, n: int = 1) -> None:
        self.counts[key] = self.counts.get(key, 0) + n


# --------------------------------------------------------------- résolution

class Resolver:
    """Nom (wikilink, itemIcon, champ Cargo) → ItemId."""

    def __init__(self, item_rows: list[dict]) -> None:
        self.by_name: dict[str, str] = {}
        for row in item_rows:
            item_id = slugify(row["_pageName"])
            for candidate in (row["_pageName"], row.get("name") or ""):
                if candidate:
                    self.by_name.setdefault(normalize_name(candidate), item_id)

    def get(self, name: str | None) -> str | None:
        if not name:
            return None
        return self.by_name.get(normalize_name(name))


# ------------------------------------------------------------------ recettes

def build_recipes(resolver: Resolver, report: Report) -> tuple[list[dict], set[str]]:
    """Normalise les 4 tables de craft + les upgrades vers le schéma §3."""
    recipes: list[dict] = []
    seen_per_output: dict[str, int] = defaultdict(int)
    unresolved: set[str] = set()

    def resolve(name: str, context: str) -> str | None:
        item_id = resolver.get(name)
        if item_id is None and name.strip():
            unresolved.add(f"{name}  (dans {context})")
        return item_id

    def emit(kind: str, output: str, qty: str | int, bench: str,
             inputs: list[tuple[str, int]], context: str) -> None:
        out_id = resolve(output, context)
        if out_id is None:
            return
        resolved: list[dict] = []
        for name, amount in inputs:
            in_id = resolve(name, context)
            if in_id is None:
                return
            resolved.append({"item": in_id, "qty": amount})
        if not resolved:
            return
        seen_per_output[out_id] += 1
        recipes.append({
            "id": f"r_{out_id}_{seen_per_output[out_id]}",
            "kind": kind,
            "output": {"item": out_id, "qty": int(qty or 1)},
            "inputs": resolved,
            "bench": bench,
        })

    for row in load("Recipes"):
        inputs = [(row[f"ingredient{i}Item"], int(row[f"ingredient{i}Amount"] or 1))
                  for i in range(1, 5) if row.get(f"ingredient{i}Item")]
        emit("craft", row["resultItem"], row["resultAmount"],
             row["requiredStation"] or "Crafting Bench", inputs, row["_pageName"])

    for table, (bench, max_ing, has_amounts) in EXTRA_CRAFT_TABLES.items():
        for row in load(table):
            inputs = []
            for i in range(1, max_ing + 1):
                name = row.get(f"ingredient{i}Item")
                if not name:
                    continue
                amount = int(row.get(f"ingredient{i}Amount") or 1) if has_amounts else 1
                inputs.append((name, amount))
            emit("craft", row["resultItem"], row["resultAmount"], bench,
                 inputs, f"{table}/{row['_pageName']}")

    for row in load("DistillRecipes"):
        if row.get("ingredient"):
            emit("craft", row["resultItem"], row["resultAmount"], "Distillation Station",
                 [(row["ingredient"], 1)], f"DistillRecipes/{row['_pageName']}")

    for row in load("UpgradeRecipes"):
        inputs = [(row[f"ingredient{i}Item"], int(row[f"ingredient{i}Amount"] or 1))
                  for i in range(1, 5) if row.get(f"ingredient{i}Item")]
        if row.get("baseItem"):
            inputs.insert(0, (row["baseItem"], 1))
        emit("upgrade", row["resultItem"], 1, "Enhancement Bench",
             inputs, f"UpgradeRecipes/{row['_pageName']}")

    report.counts["recettes craft"] = sum(1 for r in recipes if r["kind"] == "craft")
    report.counts["recettes upgrade"] = sum(1 for r in recipes if r["kind"] == "upgrade")
    return recipes, unresolved


# ------------------------------------------------------------------- sources

class OriginResolver:
    """Choisit, parmi les liens d'une phrase, celui qui désigne l'item d'origine.

    Le wikitext lie pêle-mêle l'objet d'origine, l'établi où l'on opère et le
    secteur où chercher. Prendre le premier lien donnait « Aloe ← Repair and
    Salvage Station » ou « Desk Leg ← Office Sector ». On écarte donc les
    établis, les zones et l'item lui-même, et on rend aussi la zone quand un
    lien en désigne une.
    """

    def __init__(self, resolver: Resolver, zones: list[str], benches: set[str]) -> None:
        self.resolver = resolver
        self.zones = {normalize_name(z): z for z in zones}
        self.benches = {normalize_name(b) for b in benches}

    def pick(self, targets: list[str], self_id: str) -> tuple[str | None, str | None, str | None]:
        """→ (item d'origine, libellé lisible, zone) — chacun optionnel."""
        origin = label = zone = None
        for target in targets:
            key = normalize_name(target)
            if zone is None and key in self.zones:
                zone = self.zones[key]
                continue
            if key in self.benches:
                continue
            item_id = self.resolver.get(target)
            if item_id == self_id:
                continue
            if origin is None and item_id is not None:
                origin, label = item_id, strip_links(target)
            elif label is None:
                label = strip_links(target)
        return origin, label, zone


def amounts(row: dict) -> tuple[int, int]:
    """(min, max) d'une ligne Loot ou ItemScrapingResults.

    `amountMin` vaut 0 sur 46 des 116 lignes de Loot : l'objet n'est pas garanti
    (une Manufacturing Wood Crate donne 0 à 3 Box of Screws). Ne garder que le
    max effaçait cette nuance du dataset, alors qu'elle distingue une source
    fiable d'un coup de chance.
    """
    raw_max = row.get("amountMax")
    raw_min = row.get("amountMin")
    qty_max = int(raw_max) if raw_max not in (None, "") else 1
    qty_min = int(raw_min) if raw_min not in (None, "") else qty_max
    return min(qty_min, qty_max), qty_max


def source_key(source: dict) -> tuple:
    return (source["kind"], source.get("zone"), source.get("target"), source.get("from"))


def build_sources(resolver: Resolver, origins: OriginResolver,
                  report: Report) -> tuple[dict[str, list[dict]], list[str]]:
    """Assemble les sources par item : salvage, loot, drops, zones, prose."""
    sources: dict[str, list[dict]] = defaultdict(list)
    review: list[str] = []

    def add(item_id: str | None, source: dict) -> None:
        if not item_id:
            return
        bucket = sources[item_id]
        key = source_key(source)
        for existing in bucket:
            if source_key(existing) == key:
                # `where` est une liste d'emplacements : deux sources
                # identiques par ailleurs les cumulent au lieu de s'écraser
                for spot in source.get("where", []):
                    existing.setdefault("where", [])
                    if spot not in existing["where"]:
                        existing["where"].append(spot)
                return
        bucket.append(source)

    # 1. salvage. La table est indexée par objet démonté : la relire à l'envers
    # donne jusqu'à 190 provenances pour Metal Scrap, ce qui noie la colonne de
    # droite. On ne garde que les MAX_SALVAGE meilleurs rendements (cf. DECISIONS.md).
    salvage: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    for row in load("ItemScrapingResults"):
        result_id = resolver.get(row.get("result"))
        from_id = resolver.get(row.get("item"))
        if result_id and from_id:
            salvage[result_id].append((*amounts(row), from_id))
    for result_id, entries in salvage.items():
        entries.sort(key=lambda e: (-e[1], e[2]))
        for qty_min, qty_max, from_id in entries[:MAX_SALVAGE]:
            add(result_id, {"kind": "salvage", "from": from_id,
                            "qtyMin": qty_min, "qtyMax": qty_max})

    # 2. objets cassés / ramassés, hors zone pour l'instant
    object_items: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for row in load("Loot"):
        target = normalize_name(row["sourceObject"] or row["sourceEnemy"])
        if not target:
            continue
        kind = "break" if row["sourceType"] == "destroyObject" else "pickup"
        item_id = resolver.get(row["item"])
        if item_id:
            object_items[target].append((item_id, kind))
            qty_min, qty_max = amounts(row)
            add(item_id, {"kind": kind,
                          "target": pretty(row["sourceObject"] or row["sourceEnemy"]),
                          "qtyMin": qty_min, "qtyMax": qty_max})

    # 2 bis. chaînes de cuisson, de découpe et de décomposition : la table
    # Items déclare en colonnes ce que la prose racontait mal — cuire X donne
    # Y (cookingCookedItem), le découper donne Z (cookingPortionItem), le
    # laisser pourrir donne W (decayToItem). C'est ce qui relie l'Anteverse
    # Cheese à sa meule, et la meule aux curds qu'une soupe fabrique.
    derivations: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for row in load("Items"):
        row_id = resolver.get(row["_pageName"])
        if not row_id:
            continue
        for field in ("cookingCookedItem", "cookingPortionItem", "decayToItem"):
            name = (row.get(field) or "").strip()
            result_id = resolver.get(name)
            if result_id and result_id != row_id:
                derivations[result_id].append((row_id, row["_pageName"]))
    for result_id, origins_ in derivations.items():
        # 245 aliments pourrissent en Rotten Food : au complet, l'éventail
        # noierait sa fenêtre — même plafond que le salvage (cf. DECISIONS.md)
        for from_id, from_name in sorted(set(origins_))[:MAX_SALVAGE]:
            add(result_id, {"kind": "pickup", "from": from_id, "target": from_name})
            report.bump("dérivations cuisson/découpe/décomposition")

    # 3. drops d'ennemis
    enemy_items: dict[str, list[str]] = defaultdict(list)
    for row in load("Enemies"):
        drops = [row.get(f"drop{i}") for i in range(1, 14)]
        drops += [row.get(f"harvest{i}") for i in range(1, 11)]
        for name in filter(None, drops):
            item_id = resolver.get(name)
            if item_id:
                enemy_items[normalize_name(row["name"] or row["_pageName"])].append(item_id)
                add(item_id, {"kind": "drop", "target": row["name"] or row["_pageName"]})

    # 4. zones — les 9 secteurs ET les mondes-portails : leurs infobox
    # déclarent ennemis et items au même format, et un monde-portail n'a que
    # ça (Flathill n'a pas de section == Items ==, son infobox liste Power
    # Cell, Symphonist…). Ne lire que les secteurs laissait ces zones muettes.
    sectors = json.loads((RAW / "sectors.json").read_text())
    zones_seen: list[str] = []
    for title in fetch_wikitext.zone_titles(sectors):
        wikitext = fetch_wikitext.read_page(title)
        if not wikitext:
            if title in sectors:
                report.warn(f"page secteur absente du cache : {title}")
            continue
        zones_seen.append(title)
        buckets = parse_sector(wikitext)

        for kind in ("pickup", "drop", "vendor", "grow"):
            for name in buckets.get(kind, []):
                add(resolver.get(name), {"kind": kind, "zone": title})

        # les « Resource Nodes » sont des objets : on passe par la table Loot
        for object_name in buckets.get("node", []):
            for item_id, kind in object_items.get(normalize_name(object_name), []):
                add(item_id, {"kind": kind, "zone": title, "target": object_name})

        # les ennemis listés dans l'infobox donnent leurs drops dans cette zone
        for enemy in parse_sector_enemies(wikitext):
            for item_id in enemy_items.get(normalize_name(enemy), []):
                add(item_id, {"kind": "drop", "zone": title, "target": enemy})

        # les items de l'infobox se ramassent dans la zone
        for name in parse_zone_items(wikitext):
            item_id = resolver.get(name)
            if item_id:
                add(item_id, {"kind": "pickup", "zone": title})
                report.bump("items lus dans les infobox de zone")

    # « trading with [[The Blacksmith]] » n'a pas de géographie : c'est la page
    # du PNJ ({{Person}}, appearance1..N) qui dit où il vit. À défaut
    # d'infobox (le Quantum Exchanger est une machine), le premier lien de la
    # page qui désigne une zone connue fait foi.
    npc_cache: dict[str, str | None] = {}

    def vendor_zone(name: str | None) -> str | None:
        if not name:
            return None
        if name not in npc_cache:
            page = fetch_wikitext.read_page(name) or ""
            zones = parse_person_zones(page)
            if not zones:
                known = {normalize_name(z): z for z in origins.zones.values()}
                zones = [known[normalize_name(t)] for t in link_targets(page)
                         if normalize_name(t) in known]
            npc_cache[name] = zones[0] if zones else None
        return npc_cache[name]

    # 5. prose == Sources == et section == Locations == des pages item
    for path in sorted((RAW / "pages").glob("*.wikitext")):
        title = path.stem.replace("_", " ").replace("%2F", "/")
        item_id = resolver.get(title)
        if not item_id:
            continue
        wikitext = fetch_wikitext.read_page(title) or ""

        # == Locations == est la seule géographie exhaustive du wiki : les
        # listes des pages secteur sont très partielles. Le Fire Extinguisher y
        # cite quatre lieux là où Manufacturing West n'en connaissait qu'un.
        for entry in parse_locations(wikitext, title):
            add(item_id, entry)
            report.bump("lieux lus dans == Locations ==")

        prose, unknown = parse_sources(wikitext, title)
        review += [f"{title} :: {line}" for line in unknown]

        for sentence in prose:
            origin, label, zone = origins.pick(sentence.pop("targets", []), item_id)
            if origin:
                sentence["from"] = origin
                report.bump("sources dérivées résolues")
            if label:
                sentence["target"] = label
            if zone:
                sentence["zone"] = zone
            if sentence["kind"] == "vendor" and "zone" not in sentence:
                npc = vendor_zone(sentence.get("target"))
                if npc:
                    sentence["zone"] = npc
                    report.bump("ventes localisées par la page du PNJ")

            target = normalize_name(sentence.get("target") or "")
            same_kind = [s for s in sources.get(item_id, [])
                         if s["kind"] == sentence["kind"]]
            # la phrase décrit un fait précis : elle ne doit renseigner `where`
            # que sur la source correspondante, pas sur toutes celles du même type
            best = next((s for s in same_kind
                         if target and normalize_name(s.get("target") or "") == target), None)
            if best is None and not target:
                # Sans cible, la phrase est vague (« ...through finding it in a
                # few locations. ») : elle ne doit pas venir contredire une
                # source déjà localisée, seulement compléter une source globale.
                best = next((s for s in same_kind
                             if not s.get("where") and not s.get("zone")), None)
            if best is not None:
                best.setdefault("where", sentence["where"])
            else:
                add(item_id, sentence)

    prune_sources(sources)
    report.counts["zones lues"] = len(zones_seen)
    return sources, review


def pretty(link: str) -> str:
    """Nom lisible d'une cible, en conservant la casse du wiki."""
    return strip_links(link) if link else ""


def prune_sources(sources: dict[str, list[dict]]) -> None:
    """Retire les sources strictement moins précises qu'une autre.

    La table Loot, les drops d'ennemis et les listes de secteur décrivent
    souvent le même fait à trois niveaux de détail (« drop », « drop dans
    Office Sector », « drop du Security Bot dans Office Sector »). On ne garde
    que le plus précis, sinon la colonne de droite répète trois fois la même
    ligne.
    """
    for item_id, bucket in sources.items():
        keep: list[dict] = []
        for source in bucket:
            covers = [
                other
                for other in bucket
                if other is not source
                and other["kind"] == source["kind"]
                and (source.get("zone") is None or other.get("zone") == source.get("zone"))
                and (source.get("target") is None
                     or normalize_name(other.get("target") or "")
                     == normalize_name(source.get("target") or ""))
                and (other.get("zone") is not None) >= (source.get("zone") is not None)
                and (other.get("target") is not None) >= (source.get("target") is not None)
                and (other.get("zone") is not None, other.get("target") is not None)
                != (source.get("zone") is not None, source.get("target") is not None)
            ]
            if not covers:
                keep.append(source)
            else:
                # La source retenue est plus précise mais vient du croisement
                # secteur × Loot, qui ne porte pas de quantité : on lui transfère
                # ce que la variante écartée savait, plutôt que de le perdre.
                # Volontairement limité aux quantités : reporter aussi `where`
                # recollerait une phrase vague sur une source localisée.
                # une source globale peut être couverte par plusieurs sources
                # zonées (la même caisse listée dans deux secteurs) : la
                # quantité doit aller sur toutes, pas seulement la première
                for cover in covers:
                    for field in ("qtyMin", "qtyMax"):
                        if field in source and field not in cover:
                            cover[field] = source[field]
        sources[item_id] = keep


# ----------------------------------------------------------------- providers

def merge_contents(loot_rows: list[dict], table_rows: list[dict],
                   page_drops: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Contenu de chaque objet : `Loot` ∪ `LootTablesItems` ∪ tableau de page.

    Les trois se recoupent — `Computer` figure dans les deux tables Cargo, une
    caisse dans `Loot` et dans le tableau de sa page — mais chacune sait quelque
    chose que les autres ignorent : `LootTablesItems` seule porte `Chance`, le
    tableau de page seul couvre les onze caisses absentes de Cargo. On fusionne
    par (objet, item), la première valeur rencontrée gagnant : Cargo, structuré,
    passe donc avant la prose du tableau.

    Le dédoublonnage n'est pas cosmétique : `LootTables` déclare le set
    `Refrigerator` sur deux pages (*Refrigerator* et *Horizon Mini Fridge*), ce
    qui fait arriver ses quatre lignes en double.
    """
    out: dict[str, dict[str, dict]] = defaultdict(dict)

    def put(obj: str, name: str, qty_min: int | None = None, qty_max: int | None = None,
            chance: float | None = None, chance_text: str | None = None) -> None:
        obj, name = obj.strip(), name.strip()
        if not obj or not name:
            return
        entry = out[obj].setdefault(name, {"item": name})
        if qty_max is not None and "qtyMax" not in entry:
            entry["qtyMin"], entry["qtyMax"] = qty_min, qty_max
        if chance is not None:
            entry.setdefault("chance", chance)
        if chance_text:
            entry.setdefault("chanceText", chance_text)

    for row in loot_rows:
        target = strip_links(row.get("sourceObject") or row.get("sourceEnemy") or "")
        put(target, row.get("item") or "", *amounts(row))

    for row in table_rows:
        qty_min, qty_max = amounts({"amountMin": row.get("QuantityMin"),
                                    "amountMax": row.get("QuantityMax")})
        raw_chance = row.get("Chance")
        put(row.get("SetName") or "", row.get("ItemName") or "", qty_min, qty_max,
            float(raw_chance) if raw_chance not in (None, "") else None)

    for obj, drops in page_drops.items():
        for drop in drops:
            put(obj, drop["item"], drop.get("qtyMin"), drop.get("qtyMax"),
                drop.get("chance"), drop.get("chanceText"))

    return {obj: list(entries.values()) for obj, entries in out.items()}


def enemy_contents(enemy_rows: list[dict]) -> dict[str, list[dict]]:
    """Ce qu'une créature lâche (`drop*`) et ce qu'on en récolte (`harvest*`)."""
    out: dict[str, list[dict]] = {}
    for row in enemy_rows:
        name = (row.get("name") or row["_pageName"]).strip()
        drops: list[dict] = []
        seen: set[str] = set()
        for field, via in ([(f"drop{i}", "drop") for i in range(1, 14)]
                           + [(f"harvest{i}", "harvest") for i in range(1, 11)]):
            item = (row.get(field) or "").strip()
            if item and item not in seen:
                seen.add(item)
                drops.append({"item": item, "via": via})
        if name and drops:
            out.setdefault(name, drops)
    return out


def provider_pages() -> tuple[dict[str, str], dict[str, str]]:
    """→ (nature par nom, titre de page par nom), pour tout objet candidat.

    Mêmes quatre provenances que `fetch_wikitext.object_titles` : sans la
    dernière — les « Resource Nodes » des pages secteur — les caisses absentes
    de Cargo (Office Wood Crate, Reactors Wood Crate, ASO Wood Crate) n'auraient
    jamais de fenêtre, alors que leur page en dit tout.
    """
    kinds: dict[str, str] = {}
    pages: dict[str, str] = {}

    for row in load("Objects"):
        name = strip_links(row.get("name") or "").strip()
        if name:
            kinds[name] = PROVIDER_KINDS.get(row.get("type") or "", "container")
            pages.setdefault(name, name)

    for row in load("LootTables"):
        name = (row.get("SetName") or "").strip()
        page = (row.get("_pageName") or "").strip()
        if not name:
            continue
        kinds.setdefault(name, PROVIDER_KINDS.get((row.get("Type") or "").lower(),
                                                  "container"))
        # `Data:ContainerLoot` n'est pas une page d'objet ; entre deux pages
        # réelles, celle qui porte le nom du set est la bonne (Refrigerator
        # plutôt que Horizon Mini Fridge).
        if page and ":" not in page and (name not in pages or page == name):
            pages[name] = page

    for row in load("Enemies"):
        name = (row.get("name") or row["_pageName"]).strip()
        if name:
            kinds.setdefault(name, "enemy")
            pages.setdefault(name, row["_pageName"])

    for title in json.loads((RAW / "sectors.json").read_text()):
        for name in parse_sector(fetch_wikitext.read_page(title) or "").get("node", []):
            kinds.setdefault(name, "destroyable")

    # à défaut d'un titre déclaré, la page porte le nom de l'objet : c'est le cas
    # des six sets décrits sur `Data:ContainerLoot`, qui n'y renvoient pas
    for name in kinds:
        pages.setdefault(name, name)

    return kinds, pages


def build_providers(resolver: Resolver, sources: dict[str, list[dict]],
                    zone_names: list[str], report: Report) -> dict[str, dict]:
    """Objets fouillables et créatures — ce que la fenêtre de détail montre.

    Rien ici n'invente de géographie : les zones viennent d'abord de l'index des
    sources d'items relu à l'envers, si bien qu'une fenêtre ne peut pas situer
    une caisse ailleurs que le bilan de droite.
    """
    kinds, pages = provider_pages()
    # beaucoup de contenants sont aussi des items (Trash Bin, Toolbox, Office
    # Chair) : leur page n'a pas toujours de champ `image`, la table Items si
    item_icons = {slugify(row["_pageName"]): icon_filename(row["image"])
                  for row in load("Items") if row.get("image")}
    # et huit objets n'ont pour page qu'une redirection vers la liste commune
    listed_icons: dict[str, str] = {}
    for page in {row["_pageName"] for row in load("Objects")}:
        for name, image in parse_object_images(fetch_wikitext.read_page(page) or "").items():
            listed_icons.setdefault(normalize_name(name), icon_filename(image))
    wikitexts = {name: fetch_wikitext.read_page(page) or ""
                 for name, page in pages.items()}
    contents = merge_contents(
        load("Loot"), load("LootTablesItems"),
        {name: parse_drop_table(text, pages[name]) for name, text in wikitexts.items()},
    )
    creatures = enemy_contents(load("Enemies"))

    # zones connues de chaque cible, telles que le bilan les affiche déjà
    zones_of: dict[str, list[str]] = defaultdict(list)
    for bucket in sources.values():
        for source in bucket:
            key = normalize_name(source.get("target") or "")
            zone = source.get("zone")
            if key and zone and zone not in zones_of[key]:
                zones_of[key].append(zone)

    providers: dict[str, dict] = {}
    for name in sorted(set(kinds) | set(contents) | set(creatures)):
        drops: list[dict] = []
        for drop in contents.get(name, []) + creatures.get(name, []):
            item_id = resolver.get(drop["item"])
            if item_id is None:
                report.bump("contenus non résolus vers un item")
                continue
            drops.append({**drop, "item": item_id})

        # une zone porte ses propres emplacements : les mettre à plat rendait
        # « Vehicle Lot 07 » indiscernable de « Botanical Wing », à sept
        # secteurs de distance
        zones: list[dict] = [{"zone": z} for z in zones_of.get(normalize_name(name), [])]

        provider: dict = {
            "id": slugify(name),
            "name": name,
            "kind": kinds.get(name, "container"),
            "zones": zones,
            "drops": drops,
        }

        page, wikitext = pages.get(name), wikitexts.get(name)
        if page and wikitext:
            provider["wikiTitle"] = page.replace(" ", "_")
            image = parse_infobox_image(wikitext, page)
            if image:
                provider["icon"] = icon_filename(image)
            for entry in parse_locations(wikitext, page):
                known = next((z for z in zones if z["zone"] == entry["zone"]), None)
                if known is None:
                    known = {"zone": entry["zone"]}
                    zones.append(known)
                if entry.get("where"):
                    known["where"] = entry["where"]
            if not zones:
                # les pages de créatures décrivent leurs lieux en prose, sans
                # sous-titres de zone : la Peccary Sow en nomme trois ainsi
                for name_ in zone_mentions(wikitext, zone_names):
                    zones.append({"zone": name_})
                    report.bump("zones de provider lues en prose")

        if "icon" not in provider:
            fallback = (item_icons.get(resolver.get(name) or "")
                        or listed_icons.get(normalize_name(name)))
            if fallback:
                provider["icon"] = fallback

        # sans contenu, sans image et sans zone, la fenêtre serait vide
        if provider["drops"] or provider.get("icon") or provider["zones"]:
            providers[provider["id"]] = provider

    return providers


def link_targets_to_providers(sources: dict[str, list[dict]],
                              providers: dict[str, dict], report: Report) -> None:
    """Pose `targetId` sur les sources dont la cible a une fenêtre.

    C'est le scraper qui tranche, pas l'interface : un rapprochement par nom au
    runtime confondrait l'item « Toolbox » et le contenant « Toolbox ».
    """
    by_name = {normalize_name(p["name"]): p["id"] for p in providers.values()}

    def resolve(target: str) -> str | None:
        key = normalize_name(target)
        if key in by_name:
            return by_name[key]
        # « Snowman (Enemy) » désigne le provider « The Snowman » : le wiki
        # qualifie entre parenthèses ce que la table Enemies nomme autrement
        stripped = re.sub(r"\s*\(enemy\)$", "", key).strip()
        for candidate in (stripped, f"the {stripped}"):
            if candidate in by_name:
                return by_name[candidate]
        return None

    linked = orphan = 0
    for bucket in sources.values():
        for source in bucket:
            target = source.get("target")
            if not target:
                continue
            provider_id = resolve(target)
            if provider_id:
                source["targetId"] = provider_id
                linked += 1
            else:
                orphan += 1
    report.counts["sources liées à une fenêtre"] = linked
    report.counts["cibles sans fenêtre"] = orphan


# --------------------------------------------------------------------- items

def attach_unlocks(recipes: list[dict], resolver: Resolver, report: Report) -> None:
    """Reporte la phrase d'unlock de la page item sur ses recettes de craft.

    Elle est en prose juste au-dessus de {{itemRecipe}} et n'existe donc pas
    dans Cargo. Un item à plusieurs recettes reçoit la même phrase sur toutes :
    le wiki n'en documente qu'une.
    """
    by_title: dict[str, str] = {}
    for path in sorted((RAW / "pages").glob("*.wikitext")):
        title = path.stem.replace("_", " ").replace("%2F", "/")
        item_id = resolver.get(title)
        if not item_id:
            continue
        unlock = parse_unlock(fetch_wikitext.read_page(title) or "")
        if unlock:
            by_title[item_id] = unlock

    for recipe in recipes:
        if recipe["kind"] != "craft":
            continue
        unlock = by_title.get(recipe["output"]["item"])
        if unlock:
            recipe["unlock"] = unlock
    report.counts["recettes avec unlock"] = sum(1 for r in recipes if r.get("unlock"))


def build_items(resolver: Resolver, scope: set[str], recipes: list[dict],
                sources: dict[str, list[dict]], report: Report) -> dict[str, dict]:
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    craftable = {r["output"]["item"] for r in recipes if r["kind"] == "craft"}
    items: dict[str, dict] = {}

    for row in load("Items"):
        item_id = slugify(row["_pageName"])
        if item_id not in scope:
            continue
        item: dict = {
            "id": item_id,
            # Cargo échappe le paramètre `name` du template : 25 items
            # arrivaient en « Fisherman&#39;s Glue ». `_pageName`, lui, est propre.
            "name": html.unescape(row.get("name") or "") or row["_pageName"],
            "wikiTitle": row["_pageName"].replace(" ", "_"),
            "category": CATEGORY_FIXES.get(row.get("category") or "",
                                           row.get("category") or "Divers"),
            "stack": int(row.get("stackSize") or 1),
            "sources": sources.get(item_id, []),
            "meta": {"fetchedAt": fetched_at, "verified": False},
        }
        if row.get("image"):
            item["icon"] = icon_filename(row["image"])
        else:
            report.bump("items sans champ image dans Cargo")
        if row.get("description"):
            item["description"] = html.unescape(row["description"])
        if row.get("weight"):
            item["weight"] = float(row["weight"])
        if row.get("researchMaterial"):
            item["researchMaterial"] = row["researchMaterial"]
        if row.get("gearSlot"):
            item["gearSlot"] = row["gearSlot"]

        if item_id in craftable and item["sources"]:
            # Défaut de la spec : "loot". Exception assumée (cf. DECISIONS.md) —
            # un item dont les seules sources sont du salvage ne se « ramasse »
            # pas : il faudrait démonter un objet fini pour l'obtenir, ce qui
            # n'est jamais un plan d'approvisionnement. Sa voie est le craft.
            only_salvage = all(s["kind"] == "salvage" for s in item["sources"])
            item["primary"] = "craft" if only_salvage else "loot"
            report.bump("duals primary=craft" if only_salvage else "duals primary=loot")
        items[item_id] = item

    return items


def icon_filename(image: str) -> str:
    """Nom de fichier tel que MediaWiki le normalise.

    Le wiki met une majuscule à l'initiale des titres de la page File: et
    remplace les espaces par des underscores : le champ Cargo
    `itemicon_anvil.png` désigne en réalité `File:Itemicon_anvil.png`. Sans
    cette normalisation, l'appariement entre la réponse imageinfo et le nom
    demandé échoue pour toutes les icônes en minuscule.
    """
    # certains items donnent un wikilien complet ([[File:Cupboard1.png]])
    # au lieu du seul nom de fichier
    inner = re.fullmatch(r"\[\[\s*(?:File|Image)\s*:\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]\]",
                         image.strip(), re.I)
    name = (inner.group(1) if inner else image.strip()).replace(" ", "_")
    return name[:1].upper() + name[1:]


# -------------------------------------------------------------------- icônes

def download_icons(entries: list[dict], wiki: Wiki, report: Report) -> None:
    """Récupère les fichiers manquants. `entries` mêle items et providers : les
    deux portent un champ `icon` et se servent au même endroit."""
    ICONS.mkdir(parents=True, exist_ok=True)
    wanted = {it["icon"] for it in entries if it.get("icon")}
    missing_local = sorted(n for n in wanted if not (ICONS / n).exists())
    urls: dict[str, str] = {}

    for start in range(0, len(missing_local), 50):
        titles = "|".join(f"File:{n}" for n in missing_local[start:start + 50])
        data = wiki.api(action="query", titles=titles, prop="imageinfo", iiprop="url")
        for page in data.get("query", {}).get("pages", []):
            info = page.get("imageinfo")
            if info:
                urls[page["title"].removeprefix("File:").replace(" ", "_")] = info[0]["url"]

    for name in missing_local:
        url = urls.get(name)
        if not url:
            report.bump("icônes introuvables sur le wiki")
            continue
        try:
            wiki.download(url, ICONS / name)
        except RuntimeError as exc:
            report.bump("téléchargements échoués")
            report.warn(f"icône {name} : {exc}")

    for entry in entries:
        if entry.get("icon") and not (ICONS / entry["icon"]).exists():
            entry.pop("icon")


# ---------------------------------------------------------------------- main

def build_zones(known: set[str], report: Report) -> list[dict]:
    """Ordonne les zones : chaque secteur, puis ses mondes-portails.

    ZONE_ORDER fixe à la main l'ordre de progression des 9 secteurs (le wiki ne
    l'expose pas). Les mondes-portails, eux, sont déclarés par l'infobox de leur
    secteur : les insérer juste après leur parent donne un ordre lisible sans
    rien coder en dur de plus, et renseigne `Zone.parent` du §3.
    """
    ordered: list[dict] = []
    seen: set[str] = set()

    def push(name: str, parent: str | None = None) -> None:
        if name in seen:
            return
        seen.add(name)
        zone: dict = {"name": name, "order": len(ordered)}
        if parent:
            zone["parent"] = parent
        wikitext = fetch_wikitext.read_page(name) or ""
        icon = parse_zone_icon(wikitext)
        if icon:
            zone["icon"] = icon_filename(icon)
        else:
            report.bump("zones sans pastille")
        links = parse_sector_links(wikitext)
        if links:
            zone["links"] = links
            report.bump("zones avec liens")
        ordered.append(zone)

    for sector in ZONE_ORDER:
        push(sector)
        wikitext = fetch_wikitext.read_page(sector)
        if not wikitext:
            continue
        for world in parse_sector_portal_worlds(wikitext):
            push(world, sector)

    # ce qui reste vient de sous-lieux non déclarés comme mondes-portails
    for name in sorted(known - seen):
        report.warn(f"lieu hors secteurs et mondes-portails, ajouté en fin : {name}")
        push(name)

    return ordered


def attach_zone_colors(zones: list[dict], report: Report) -> None:
    """Donne à chaque zone la couleur de sa pastille.

    Le wiki a déjà choisi une couleur par secteur et par monde-portail : la
    prendre dans l'image plutôt que l'inventer garantit que la pastille et la
    couleur de la zone ne se contredisent jamais.
    """
    for zone in zones:
        path = ICONS / zone["icon"] if zone.get("icon") else None
        if path is None or not path.exists():
            continue
        color = dominant_color(path)
        if color:
            zone["color"] = color
            report.bump("zones avec couleur")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--no-icons", action="store_true", help="ne pas télécharger les icônes")
    ap.add_argument("--force", action="store_true", help="ignore le cache HTTP des icônes")
    args = ap.parse_args()

    report = Report()
    item_rows = load("Items")
    resolver = Resolver(item_rows)

    recipes, unresolved = build_recipes(resolver, report)
    attach_unlocks(recipes, resolver, report)
    benches = {r["bench"] for r in recipes} | {"Repair and Salvage Station"}
    # les mondes-portails sont des zones au même titre que les secteurs : sans
    # eux, « found in [[Rise]] » rangeait Rise en cible au lieu de zone, et la
    # source restait sans géographie (Egg, Corrupted Corn…)
    all_zones = list(ZONE_ORDER)
    for sector in ZONE_ORDER:
        all_zones += parse_sector_portal_worlds(fetch_wikitext.read_page(sector) or "")
    origins = OriginResolver(resolver, all_zones, benches)
    sources, review = build_sources(resolver, origins, report)

    providers = build_providers(resolver, sources, all_zones, report)
    link_targets_to_providers(sources, providers, report)

    scope = {r["output"]["item"] for r in recipes}
    scope |= {i["item"] for r in recipes for i in r["inputs"]}
    # Les objets qu'on démonte pour obtenir une ressource doivent figurer dans
    # le dataset, sinon la colonne de droite affiche leur slug au lieu de leur nom.
    scope |= {s["from"] for bucket in sources.values() for s in bucket if s.get("from")}
    # Idem pour le contenu d'une caisse : sa fenêtre lie chaque item, et un lien
    # vers un item absent du dataset n'irait nulle part.
    scope |= {d["item"] for p in providers.values() for d in p["drops"]}
    items = build_items(resolver, scope, recipes, sources, report)


    # compté après le téléchargement : une icône introuvable sur le wiki est
    # retirée par `download_icons`, le rapport doit dire ce qui reste
    report.counts["providers avec contenu"] = sum(1 for p in providers.values() if p["drops"])
    report.counts["providers avec image"] = sum(1 for p in providers.values() if p.get("icon"))
    report.counts["providers avec zone"] = sum(1 for p in providers.values() if p["zones"])
    report.counts["providers avec emplacements"] = sum(
        1 for p in providers.values() if any(z.get("where") for z in p["zones"]))

    known_zones = {s.get("zone") for it in items.values() for s in it["sources"]} - {None}
    zones = build_zones(known_zones, report)

    if not args.no_icons:
        download_icons([*items.values(), *providers.values(), *zones],
                       Wiki(force=args.force), report)
    attach_zone_colors(zones, report)

    dataset = {
        "items": items,
        "recipes": [r for r in recipes if r["output"]["item"] in items],
        "zones": zones,
        "providers": providers,
    }

    # On lit désormais les 1 622 pages du wiki, mais le dataset n'en garde que
    # le périmètre utile : ne remonter à la relecture que ce qui s'y trouve.
    review = [line for line in review if slugify(line.split(" :: ", 1)[0]) in items]
    NEEDS_REVIEW.write_text("\n".join(review) + "\n")
    OUT.write_text(json.dumps(dataset, indent=1, ensure_ascii=False))

    # ---------------- rapport ----------------
    craftable = {r["output"]["item"] for r in dataset["recipes"] if r["kind"] == "craft"}
    lootable = {i for i, it in items.items() if it["sources"]}
    print(f"\n{OUT.relative_to(ROOT)}")
    print(f"  items                        {len(items)}")
    print(f"  recettes craft               {sum(1 for r in dataset['recipes'] if r['kind'] == 'craft')}")
    print(f"  recettes upgrade             {sum(1 for r in dataset['recipes'] if r['kind'] == 'upgrade')}")
    print(f"  craftables                   {len(craftable)}")
    print(f"  lootables                    {len(lootable)}")
    duals = craftable & lootable
    by_craft = sum(1 for i in duals if items[i].get("primary") == "craft")
    print(f"  duals                        {len(duals)} "
          f"({by_craft} primary=craft, {len(duals) - by_craft} primary=loot)")
    print(f"  items sans source ni recette {len(set(items) - craftable - lootable)}")
    sans_icone = sum(1 for it in items.values() if not it.get("icon"))
    print(f"  items sans icône             {sans_icone}"
          f" ({report.counts.get('items sans champ image dans Cargo', 0)} sans champ image)")
    print(f"  icônes non récupérées        "
          f"{report.counts.get('icônes introuvables sur le wiki', 0)} absentes du wiki, "
          f"{report.counts.get('téléchargements échoués', 0)} téléchargements échoués")
    print(f"  recettes avec unlock         {report.counts.get('recettes avec unlock', 0)}")
    derives = [i for i, it in items.items()
               if it["sources"] and all(s.get("from") for s in it["sources"])]
    spots = sum(len(s.get("where", [])) for it in items.values() for s in it["sources"])
    print(f"  emplacements pr\u00e9cis lus       {spots}")
    print(f"  items d'infobox de zone      {report.counts.get('items lus dans les infobox de zone', 0)}")
    print(f"  ventes localisées (PNJ)      {report.counts.get('ventes localisées par la page du PNJ', 0)}")
    print(f"  dérivations de cuisine       {report.counts.get('dérivations cuisson/découpe/décomposition', 0)}")
    print(f"  sources dérivées résolues    {report.counts.get('sources dérivées résolues', 0)}")
    print(f"  items purement dérivés       {len(derives)}")
    with_icon = sum(1 for z in zones if z.get("icon"))
    print(f"  zones                        {len(zones)}"
          f" ({with_icon} avec pastille, "
          f"{report.counts.get('zones avec couleur', 0)} avec couleur, "
          f"{report.counts.get('zones avec liens', 0)} avec liens)")
    print(f"  contenants et créatures      {len(providers)}"
          f" ({report.counts.get('providers avec contenu', 0)} avec contenu, "
          f"{report.counts.get('providers avec image', 0)} avec image, "
          f"{report.counts.get('providers avec zone', 0)} avec zone, "
          f"{report.counts.get('providers avec emplacements', 0)} avec emplacements)")
    print(f"  sources liées à une fenêtre  {report.counts.get('sources liées à une fenêtre', 0)}"
          f" ({report.counts.get('cibles sans fenêtre', 0)} cibles sans fenêtre)")
    print(f"  phrases à relire             {len(review)} → {NEEDS_REVIEW.relative_to(ROOT)}")
    for warning in report.warnings[:20]:
        print(f"  ! {warning}")

    if unresolved:
        print(f"\n{len(unresolved)} ingrédients non résolus :", file=sys.stderr)
        for name in sorted(unresolved)[:40]:
            print(f"  - {name}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
