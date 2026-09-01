"""Parseurs wikitext — fonctions pures, sans I/O. Couvertes par scraper/tests/.

Ce module ne connaît ni le réseau ni le disque : il transforme du wikitext en
structures Python, ce qui rend les heuristiques de la spec (§4 étape 2)
testables sans retélécharger le wiki.
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------- identifiants

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """« Keypad Hacker » → keypad_hacker ; « .308 Ammo » → 308_ammo."""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return _SLUG_STRIP.sub("_", text.lower()).strip("_")


def normalize_name(name: str) -> str:
    """Clé de rapprochement tolérante entre un lien wiki et un nom d'item."""
    return re.sub(r"\s+", " ", strip_links(name).replace("_", " ")).strip().lower()


# ---------------------------------------------------------------- wikitext brut

_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]")
_ITEM_ICON = re.compile(r"\{\{\s*itemicon\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}", re.I)
# tout autre template : on garde son dernier argument, qui porte le texte lisible
# ({{spoiler|Dr. Riggs}} → « Dr. Riggs »), et rien s'il n'en a pas
_TEMPLATE = re.compile(r"\{\{\s*[^}|]+?\s*(?:\|([^}]*))?\}\}")
_TAGS = re.compile(r"<[^>]+>")
_BOLD_ITALIC = re.compile(r"'{2,5}")


def strip_links(text: str) -> str:
    """Aplatit [[A|B]] → B, [[A]] → A, et retire balises et apostrophes wiki."""
    text = _LINK.sub(lambda m: (m.group(2) or m.group(1)).split("#")[0], text)
    text = _ITEM_ICON.sub(lambda m: m.group(1), text)
    text = _TEMPLATE.sub(lambda m: (m.group(1) or "").split("|")[-1], text)
    text = _TAGS.sub("", text)
    text = _BOLD_ITALIC.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def link_targets(text: str) -> list[str]:
    """Cibles des wikilinks d'un fragment, dans l'ordre, sans doublon."""
    out: list[str] = []
    for target, _label in _LINK.findall(text):
        target = target.split("#")[0].strip()
        if target and target not in out:
            out.append(target)
    return out


def list_entries(block: str) -> list[str]:
    """Noms cités dans une liste à puces, qu'ils soient {{itemIcon|X}} ou [[X]]."""
    out: list[str] = []
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("*"):
            continue
        icons = _ITEM_ICON.findall(line)
        names = icons or link_targets(line)
        if not names:
            plain = strip_links(line.lstrip("* ").strip())
            names = [plain] if plain else []
        for n in names:
            n = n.strip()
            if n and n not in out:
                out.append(n)
    return out


def sections(wikitext: str, level: int) -> dict[str, str]:
    """Découpe le wikitext en sections d'un niveau donné : titre → corps.

    Le corps d'une section s'arrête au titre suivant de même niveau *ou plus
    haut*, pour qu'une section de niveau 2 ne dévore pas la suivante.
    """
    marker = "=" * level
    pattern = re.compile(rf"^\s*{marker}\s*([^=].*?)\s*{marker}\s*$", re.M)
    matches = list(pattern.finditer(wikitext))
    out: dict[str, str] = {}
    for i, m in enumerate(matches):
        start = m.end()
        end = len(wikitext)
        for later in matches[i + 1:]:
            end = later.start()
            break
        # une section de niveau supérieur (moins de '=') termine aussi la section
        higher = re.compile(rf"^\s*={{1,{level - 1}}}\s*[^=].*?\s*={{1,{level - 1}}}\s*$", re.M) \
            if level > 1 else None
        if higher:
            h = higher.search(wikitext, start, end)
            if h:
                end = h.start()
        out[m.group(1).strip()] = wikitext[start:end]
    return out


# ---------------------------------------------------------------- pages secteur

# sous-section de ==Items== → nature de la source qu'elle décrit
SECTOR_SUBSECTIONS = {
    "environment": "pickup",
    "resource nodes": "node",      # liste des objets à casser, pas des items
    "drops": "drop",
    "trading": "vendor",
    "fishing": "pickup",
    "farming": "grow",
}


def parse_sector(wikitext: str) -> dict[str, list[str]]:
    """Section ==Items== d'une page secteur → {nature: [noms]}.

    Certaines pages (Fragments, The Encroachment) listent les items à plat sous
    ==Items== sans sous-titres : ils sont alors traités comme « environment ».
    """
    items_body = ""
    for title, body in sections(wikitext, 2).items():
        if title.strip().lower() == "items":
            items_body = body
            break
    if not items_body:
        return {}

    subs = sections(items_body, 3)
    if not subs:
        entries = list_entries(items_body)
        return {"pickup": entries} if entries else {}

    out: dict[str, list[str]] = {}
    # ce qui précède le premier sous-titre compte comme environnement
    head = items_body[:items_body.find("===")] if "===" in items_body else ""
    for name in list_entries(head):
        out.setdefault("pickup", []).append(name)

    for title, body in subs.items():
        kind = SECTOR_SUBSECTIONS.get(title.strip().lower())
        if kind is None:
            continue
        for name in list_entries(body):
            bucket = out.setdefault(kind, [])
            if name not in bucket:
                bucket.append(name)
    return out


def parse_sector_enemies(wikitext: str) -> list[str]:
    """Champs enemy1..enemyN de l'infobox {{Sector}}."""
    return _infobox_list(wikitext, "enemy")


def parse_sector_portal_worlds(wikitext: str) -> list[str]:
    """Champs portalWorld1..N de l'infobox {{Sector}}.

    Les pages item citent ces mondes (Flathill, The Train, Dunkeltaler Forest…)
    au même titre que les secteurs ; les rattacher à leur secteur donne un ordre
    de zones cohérent avec la progression du jeu.
    """
    return _infobox_list(wikitext, "portalWorld")


def _infobox_list(wikitext: str, prefix: str) -> list[str]:
    out: list[str] = []
    for _n, value in re.findall(rf"\|\s*{prefix}(\d+)\s*=\s*([^\n|}}]*)", wikitext):
        value = strip_links(value).strip()
        if value and value not in out:
            out.append(value)
    return out


_INFOBOX_IMAGE = re.compile(r"\|\s*image\s*=\s*([^\n|}]+)")
_FILE_LINK = re.compile(r"\[\[\s*(?:File|Image)\s*:\s*([^\]|]+)", re.I)


def parse_zone_icon(wikitext: str) -> str | None:
    """Pastille ronde d'un secteur ou d'un monde-portail.

    Les deux modèles ne la rangent pas au même endroit : `{{Sector}}` met la
    ronde directement dans son `image =`, alors que `{{PortalWorld}}` y met une
    capture carrée et pose la ronde juste après, en `[[File:Icon Flathill.png]]`.
    Le point commun est le préfixe « Icon » du nom de fichier ; on le cherche
    partout, et à défaut on retombe sur l'image de l'infobox.
    """
    infobox = parse_infobox_image(wikitext)
    candidates = _FILE_LINK.findall(wikitext)
    if infobox:
        candidates.insert(0, infobox)
    # certaines infobox écrivent « File:Icon Vignettes.png » en toutes lettres
    names = [re.sub(r"^\s*(?:File|Image)\s*:\s*", "", n, flags=re.I).strip()
             for n in candidates]
    for name in names:
        if name.lower().startswith("icon"):
            return name
    return names[0] if names else None


def parse_infobox_image(wikitext: str, page_name: str = "") -> str | None:
    """Fichier illustrant une page — l'`image =` de son infobox.

    Les caisses et les créatures n'ont pas de ligne dans la table Cargo `Items`,
    donc pas de champ `image` : leur illustration n'existe que dans le wikitext.
    Sans elle, la fenêtre de détail d'une Manufacturing Wood Crate ne pourrait
    pas répondre à « à quoi ça ressemble ».
    """
    # les pages de créatures écrivent `| image = {{PAGENAME}}.PNG`
    wikitext = wikitext.replace("{{PAGENAME}}", page_name)
    match = _INFOBOX_IMAGE.search(wikitext)
    if match:
        value = match.group(1).strip()
        inner = _FILE_LINK.match(value)          # `| image = [[File:X.png]]`
        name = (inner.group(1) if inner else value).strip()
        if name:
            return name
    # certaines pages n'ont pas d'infobox et posent l'image à la main
    fallback = _FILE_LINK.search(wikitext)
    return fallback.group(1).strip() if fallback else None


# ------------------------------------------------------------ sources en prose

# ordre significatif : la première correspondance dans la phrase gagne
SOURCE_KEYWORDS: list[tuple[str, str]] = [
    ("breaking", "break"),
    ("destroying", "break"),
    ("smashing", "break"),
    ("killing", "drop"),
    ("defeating", "drop"),
    ("dropped by", "drop"),
    ("salvaging", "salvage"),
    ("scrapping", "salvage"),
    ("dismantling", "salvage"),
    ("trading", "vendor"),
    ("purchas", "vendor"),
    ("buying", "vendor"),
    ("sells", "vendor"),
    ("growing", "grow"),
    ("planting", "grow"),
    ("harvesting", "grow"),
    ("farming", "grow"),
    ("fishing", "pickup"),
    ("butchering", "pickup"),
    ("opening", "pickup"),
    ("looting", "pickup"),
    ("found in", "pickup"),
    ("found on", "pickup"),
    ("located", "pickup"),
    ("collect", "pickup"),
]

# phrases qui ne décrivent pas une source de loot
SKIP_KEYWORDS = ("through crafting", "only be obtained through crafting",
                 "through upgrading", "through cooking")

# On ne coupe pas après une abréviation : « trading with [[Dr. Riggs]] » se
# scindait en « …trading with [[Dr. » et laissait un lien tronqué à l'écran.
_ABBREVIATIONS = ("Dr", "Mr", "Mrs", "Ms", "St", "Sgt", "Lt", "Mt", "Jr", "Sr")
_SENTENCE = re.compile(
    # chaque abréviation devient un lookbehind de longueur fixe, la seule forme
    # que `re` accepte ; `(?<![A-Z]\.)` couvre les initiales isolées (M.O.P.)
    "".join(rf"(?<!{a}\.)" for a in _ABBREVIATIONS)
    + r"(?<![A-Z]\.)(?<=[.!?])\s+"
)


def parse_sources(wikitext: str, page_name: str = "") -> tuple[list[dict], list[str]]:
    """Section == Sources == → (sources, phrases non reconnues).

    Chaque phrase donne au plus une source. `kind` vient du premier mot-clé
    trouvé ; `where` de la phrase entière aplatie ; `targets` de **tous** les
    wikilinks de la phrase, dans l'ordre. Le parseur ne choisit pas la cible :
    c'est build.py qui prend le premier lien désignant vraiment un item, parce
    que lui seul connaît les items, les zones et les établis. Prendre
    aveuglément le premier lien donnait « Aloe ← Repair and Salvage Station »
    ou « Desk Leg ← Office Sector ».

    Une phrase sans mot-clé connu est classée `pickup` et remontée dans la
    seconde valeur pour needs_review.txt.
    """
    body = ""
    for title, sec in sections(wikitext, 2).items():
        if re.fullmatch(r"sources?", title.strip(), re.I):
            body = sec
            break
    if not body:
        return [], []

    # la partie structurée par zone est déjà lue par parse_locations ; la
    # laisser ici ferait remonter « ===Office Sector=== Level 2 * Kitchen »
    # comme une phrase de prose
    body = body.split("===", 1)[0]

    body = body.replace("{{PAGENAME}}", page_name or "It")
    sources: list[dict] = []
    unknown: list[str] = []

    for raw in _SENTENCE.split(re.sub(r"^\s*\*\s*", "", body.strip(), flags=re.M)):
        raw = raw.strip()
        if not raw or raw.startswith(("{{", "[[Category", "==")):
            continue
        flat = strip_links(raw)
        if not flat or len(flat) < 8:
            continue
        low = flat.lower()
        if any(k in low for k in SKIP_KEYWORDS):
            continue

        kind = next((k for word, k in SOURCE_KEYWORDS if word in low), None)
        if kind is None:
            unknown.append(flat)
            kind = "pickup"

        source: dict = {"kind": kind, "where": [flat]}
        targets = [t for t in link_targets(raw) if normalize_name(t) != normalize_name(page_name)]
        if targets:
            source["targets"] = targets
        sources.append(source)

    return sources, unknown


# titres de section qui listent des lieux par zone
ZONE_SECTION_TITLES = ("locations", "sources", "source")


def zone_sections(wikitext: str) -> dict[str, str]:
    """Sous-sections de zone, où qu'elles soient déclarées.

    La plupart des pages les mettent sous `== Locations ==`, mais cinq (Cooking
    Pot, Frying Pan, Nachos…) les mettent sous `== Sources ==`. Sans ça, le
    parseur de prose avalait le bloc entier et recrachait « ===Office Sector===
    Level 2 * Kitchen » dans l'interface, en ne retenant qu'une zone sur sept.
    """
    out: dict[str, str] = {}
    for title, section in sections(wikitext, 2).items():
        if title.strip().lower() not in ZONE_SECTION_TITLES:
            continue
        for sub, block in sections(section, 3).items():
            zone = strip_links(sub)
            if zone and zone not in out:
                out[zone] = block
    return out


def parse_locations(wikitext: str, page_name: str = "") -> list[dict]:
    """Sections de zone → une entrée par zone, avec ses emplacements (§4 étape 2).

    C'est la seule source exhaustive de géographie du wiki : les listes des
    pages secteur sont très partielles. La page du Fire Extinguisher cite quatre
    lieux quand la liste de Manufacturing West n'en connaissait qu'un.

    Le corps est une liste à **deux niveaux** : `*` désigne une sous-zone
    (« Level 2 », « Cloud Reactor »), `**` un emplacement précis. Joindre le
    tout en un paragraphe collait l'en-tête au premier emplacement — « Level 2
    Area under the Data Farm… » — et effaçait sept lieux distincts.
    """
    out: list[dict] = []
    for zone, block in zone_sections(wikitext).items():
        spots = parse_spots(block, page_name)
        entry: dict = {"kind": "pickup", "zone": zone}
        if spots:
            entry["where"] = spots
        out.append(entry)
    return out


def parse_spots(block: str, page_name: str = "") -> list[str]:
    """Liste à puces sur deux niveaux → un emplacement par entrée.

    Une sous-puce est préfixée par sa sous-zone (`Level 2 › Bio Lab D.`) ; une
    puce de premier niveau sans enfant vaut pour elle-même.
    """
    spots: list[str] = []
    heading: str | None = None
    pending_heading = False

    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("*"):
            continue
        depth = len(line) - len(line.lstrip("*"))
        text = strip_links(line.lstrip("*# ").strip().replace("{{PAGENAME}}", page_name))
        if not text:
            continue

        if depth == 1:
            # on ne sait pas encore si c'est un en-tête ou un emplacement :
            # ça dépend de la présence d'une sous-puce juste après
            if pending_heading and heading:
                spots.append(heading)
            heading, pending_heading = text, True
        else:
            pending_heading = False
            spots.append(f"{heading} › {text}" if heading else text)

    if pending_heading and heading:
        spots.append(heading)
    return spots


# ------------------------------------------------------------- contenu d'un objet

DROP_SECTION_TITLES = ("drops", "contents", "loot")

_ITEM_SLOT = re.compile(r"\{\{\s*itemSlot\s*\|\s*([^}|]+?)\s*(\|[^}]*)?\}\}", re.I)
_SLOT_TEXT = re.compile(r"\|\s*text\s*=\s*([^|}]+)")
_RANGE = re.compile(r"(\d+)\s*(?:[-\u2013]\s*(\d+))?")
_PERCENT = re.compile(r"^(\d+(?:\.\d+)?)\s*%$")
_BREAK = re.compile(r"<\s*br\s*/?\s*>", re.I)
# une note de bas de page dans la cellule de chance : 255 caractères d'explication
# éditoriale là où on attend « 100% »
_REF = re.compile(r"<ref[^>]*>.*?</ref>", re.I | re.S)


def parse_drop_table(wikitext: str, page_name: str = "") -> list[dict]:
    """Tableau `== Drops ==` d'une page d'objet → son contenu.

    Onze caisses (Office Wood Crate, Reactors Wood Crate…) n'ont aucune ligne
    dans Cargo : leur contenu n'existe que dans ce tableau. Il porte en plus une
    chance que `Loot` ne donne jamais, mais sous forme de phrase (« 100% of 2
    <br>50% of 2-3 ») : on la garde telle quelle quand elle ne se réduit pas à
    un pourcentage simple, plutôt que d'inventer un nombre.
    """
    out: list[dict] = []
    for title, section in sections(wikitext, 2).items():
        if title.strip().lower() not in DROP_SECTION_TITLES:
            continue
        for line in section.splitlines():
            line = line.strip().replace("{{PAGENAME}}", page_name)
            if not line.startswith("|") or "itemslot" not in line.lower():
                continue
            cells = [c.strip() for c in line.lstrip("|").split("||")]
            slot = _ITEM_SLOT.search(cells[0])
            if not slot:
                continue

            name = strip_links(cells[1]) if len(cells) > 1 else ""
            entry: dict = {"item": name or slot.group(1).strip()}

            text = _SLOT_TEXT.search(slot.group(2) or "")
            span = _RANGE.search(text.group(1)) if text else None
            if span:
                entry["qtyMin"] = int(span.group(1))
                entry["qtyMax"] = int(span.group(2) or span.group(1))

            cell = _REF.sub("", cells[2]) if len(cells) > 2 else ""
            raw = strip_links(_BREAK.sub(" \u00b7 ", cell))
            percent = _PERCENT.match(raw)
            if percent:
                entry["chance"] = float(percent.group(1)) / 100
            elif raw:
                entry["chanceText"] = raw

            out.append(entry)
    return out


_OBJECT_TEMPLATE = re.compile(
    r"\{\{\s*(?:destroyable|pickup)Object\s*\|(.*?)\}\}", re.I | re.S)


def parse_object_images(wikitext: str) -> dict[str, str]:
    """Images des `{{destroyableObject}}` / `{{pickupObject}}` d'une page liste.

    Huit objets — dont la Wooden Crate elle-même — n'ont pour page qu'une
    redirection vers « Destroyable Objects » : leur illustration n'existe que
    dans le tableau de cette page.
    """
    out: dict[str, str] = {}
    for body in _OBJECT_TEMPLATE.findall(wikitext):
        name = _template_param(body, "name")
        image = _template_param(body, "image")
        if name and image:
            out.setdefault(strip_links(name), image)
    return out


def _template_param(body: str, key: str) -> str:
    match = re.search(rf"\|\s*{key}\s*=\s*([^\n|}}]*)", "|" + body)
    return match.group(1).strip() if match else ""


# ------------------------------------------------------------------- unlock

_RECIPE_TEMPLATE = re.compile(r"\{\{\s*itemRecipe", re.I)


def parse_unlock(wikitext: str) -> str | None:
    """Phrase d'unlock : la ligne de prose précédant {{itemRecipe}}."""
    m = _RECIPE_TEMPLATE.search(wikitext)
    if not m:
        return None
    before = wikitext[:m.start()].rstrip().splitlines()
    for line in reversed(before):
        line = line.strip()
        if not line or line.startswith(("=", "{{", "|", "}}", "*")):
            continue
        flat = strip_links(line)
        if "unlock" in flat.lower():
            return flat
        return None
    return None
