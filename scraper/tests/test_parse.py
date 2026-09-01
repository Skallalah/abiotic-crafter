import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parse import (  # noqa: E402
    link_targets, list_entries, normalize_name, parse_drop_table,
    parse_infobox_image, parse_locations, parse_object_images, parse_sector,
    parse_person_zones, parse_sector_enemies, parse_sector_links, parse_zone_icon,
    parse_zone_items, zone_mentions,
    parse_sources, parse_trade_offers, parse_unlock, sections, slugify, strip_links,
)


def test_slugify():
    assert slugify("Keypad Hacker") == "keypad_hacker"
    assert slugify(".308 Ammo") == "308_ammo"
    assert slugify("M.O.P. 9000") == "m_o_p_9000"
    assert slugify("Chef's Counter") == "chef_s_counter"


def test_normalize_name_matches_link_forms():
    assert normalize_name("[[Office Sector|the offices]]") == "the offices"
    assert normalize_name("Metal_Scrap") == "metal scrap"
    assert normalize_name("  Tech   Scrap ") == "tech scrap"


def test_strip_links_and_targets():
    text = "obtained by breaking a [[Computer]] or a [[Monitor|screen]]."
    assert strip_links(text) == "obtained by breaking a Computer or a screen."
    assert link_targets(text) == ["Computer", "Monitor"]
    assert link_targets("[[Mechanics#Survival mechanics|meter]]") == ["Mechanics"]


def test_list_entries_handles_both_notations():
    block = "* {{itemIcon|Desk Phone}}\n* [[Office Wood Crate]]\n* {{ItemIcon|Salt}}\n"
    assert list_entries(block) == ["Desk Phone", "Office Wood Crate", "Salt"]


def test_sections_stops_at_higher_level():
    text = "== A ==\nalpha\n=== A1 ===\nsub\n== B ==\nbeta\n"
    lvl2 = sections(text, 2)
    assert set(lvl2) == {"A", "B"}
    assert "sub" in lvl2["A"] and "beta" not in lvl2["A"]
    assert sections(lvl2["A"], 3)["A1"].strip() == "sub"


SECTOR = """{{Sector
| enemy1 = Carbuncle
| enemy2 = [[Security Bot]]
| enemy3 =
}}
== Enemies ==
blah
==Items==
=== Environment ===
* {{itemIcon|Desk Phone}}
* {{itemIcon|Stapler}}

=== Resource Nodes ===
* [[Computer]]
* [[Monitor]]

=== Drops ===
* {{itemIcon|Security Bot CPU}}

=== Trading ===
* {{itemIcon|Stapler}}

== Collectibles ==
* {{itemIcon|Bobblehead}}
"""


def test_parse_sector():
    got = parse_sector(SECTOR)
    assert got["pickup"] == ["Desk Phone", "Stapler"]
    assert got["node"] == ["Computer", "Monitor"]
    assert got["drop"] == ["Security Bot CPU"]
    assert got["vendor"] == ["Stapler"]
    assert "Bobblehead" not in str(got)          # hors de ==Items==


def test_parse_sector_flat_list():
    flat = "==Items==\n* {{itemIcon|Taco}}\n* {{itemIcon|Apple}}\n\n== Collectibles ==\n* x\n"
    assert parse_sector(flat) == {"pickup": ["Taco", "Apple"]}


def test_parse_sector_enemies():
    assert parse_sector_enemies(SECTOR) == ["Carbuncle", "Security Bot"]


def test_parse_sources_keywords():
    text = ("== Sources ==\n{{PAGENAME}} can be obtained through breaking a "
            "[[Computer]] or [[Monitor]]. Can also be obtained by killing a "
            "[[Security Bot]]. Can also be obtained through trading with "
            "[[Warren]].\n")
    sources, unknown = parse_sources(text, "Circuit Board")
    assert [s["kind"] for s in sources] == ["break", "drop", "vendor"]
    assert [s["targets"] for s in sources] == [
        ["Computer", "Monitor"], ["Security Bot"], ["Warren"],
    ]
    assert unknown == []
    assert sources[0]["where"][0].startswith("Circuit Board can be obtained")


def test_parse_sources_keeps_every_link_for_build_to_choose():
    # le premier lien est un établi : build.py doit pouvoir regarder le suivant
    text = ("== Sources ==\n{{PAGENAME}} can be acquired by salvaging a Glow Tulip "
            "at a [[Repair and Salvage Station]] or from a [[Glow Tulip]].\n")
    sources, _ = parse_sources(text, "Aloe")
    assert sources[0]["targets"] == ["Repair and Salvage Station", "Glow Tulip"]


def test_parse_sources_drops_self_links():
    # [[{{PAGENAME}}#Locations|locations]] donnait « Baton ← Baton »
    text = ("== Sources ==\n{{PAGENAME}} can only be obtained through finding it "
            "in a few [[{{PAGENAME}}#Locations|locations]].\n")
    sources, _ = parse_sources(text, "Baton")
    assert "targets" not in sources[0]


def test_parse_sources_skips_craft_only():
    text = "== Sources ==\n{{PAGENAME}} can only be obtained through Crafting.\n"
    assert parse_sources(text, "Drop Shield") == ([], [])


def test_parse_sources_reports_unknown_phrasing():
    text = "== Sources ==\nIt materialises spontaneously in the reactor core room.\n"
    sources, unknown = parse_sources(text, "Odd Thing")
    assert sources[0]["kind"] == "pickup"
    assert len(unknown) == 1


def test_parse_sources_ignores_other_sections():
    text = "== Sources ==\nIt is dropped by a [[Pest]].\n== Crafting ==\nfound in a box\n"
    sources, _ = parse_sources(text, "X")
    assert len(sources) == 1


def test_parse_unlock():
    text = ("== Crafting ==\n=== Recipe ===\n"
            "Unlocked by speaking with [[Alice Mayfield]] or collecting the components.\n"
            "{{itemRecipe\n| resultItem = X\n}}\n")
    assert parse_unlock(text) == ("Unlocked by speaking with Alice Mayfield "
                                  "or collecting the components.")


def test_parse_unlock_absent():
    assert parse_unlock("{{itemRecipe\n|resultItem = X\n}}") is None
    assert parse_unlock("no recipe here") is None


LOCATIONS = """== Sources ==
{{PAGENAME}} can only be obtained through finding it in a few locations.

== Locations ==
=== [[Manufacturing West]] ===
* Throughout the sector.

=== [[Cascade Laboratories]] ===
* Near the Wildlife Pens.
* In the storage rooms.

=== [[The Train]] ===

== Notes ==
* Sans rapport.
"""


def test_parse_locations():
    got = parse_locations(LOCATIONS)
    assert [e["zone"] for e in got] == [
        "Manufacturing West", "Cascade Laboratories", "The Train",
    ]
    assert all(e["kind"] == "pickup" for e in got)
    assert got[1]["where"] == ["Near the Wildlife Pens.", "In the storage rooms."]
    assert "where" not in got[2]          # sous-titre sans précision


def test_parse_locations_ignores_other_sections():
    assert parse_locations("== Notes ==\n=== [[Office Sector]] ===\n* rien\n") == []
    assert parse_locations("no sections here") == []


def test_parse_locations_without_subsections():
    # une liste à plat sous == Locations == ne désigne aucune zone
    assert parse_locations("== Locations ==\n* Un peu partout.\n") == []


NESTED = """== Locations ==
=== [[Office Sector]] ===
* Level 2
** Area under the Data Farm, close to a [[Pest]].
** Bio Lab D.
* Level 3
** Break Room
* Cafeteria kitchen
"""


def test_parse_spots_keeps_the_two_level_hierarchy():
    # « Level 2 » est un en-tête de sous-zone, pas un emplacement : le joindre
    # au paragraphe donnait « Level 2 Area under the Data Farm… »
    where = parse_locations(NESTED)[0]["where"]
    assert where == [
        "Level 2 › Area under the Data Farm, close to a Pest.",
        "Level 2 › Bio Lab D.",
        "Level 3 › Break Room",
        "Cafeteria kitchen",          # puce simple sans enfant : vaut pour elle-même
    ]


def test_parse_locations_substitutes_pagename():
    text = "== Locations ==\n=== [[Flathill]] ===\n* Near the {{PAGENAME}} stand.\n"
    assert parse_locations(text, "Taco")[0]["where"] == ["Near the Taco stand."]


ZONES_UNDER_SOURCES = """== Sources ==
{{PAGENAME}} can be found in these locations:

=== [[Office Sector]] ===
* Level 2
** Kitchen

=== [[Flathill]] ===
* Bounty Basket store
"""


def test_zone_sections_found_under_sources_too():
    got = parse_locations(ZONES_UNDER_SOURCES, "Cooking Pot")
    assert [e["zone"] for e in got] == ["Office Sector", "Flathill"]
    assert got[0]["where"] == ["Level 2 › Kitchen"]


def test_parse_sources_leaves_the_zone_part_alone():
    # sinon la prose recrachait « ===Office Sector=== Level 2 * Kitchen »
    sources, _ = parse_sources(ZONES_UNDER_SOURCES, "Cooking Pot")
    for source in sources:
        for line in source["where"]:
            assert "===" not in line
            assert "*" not in line


def test_strip_links_removes_other_templates():
    # {{spoiler|X}} laissait « {{spoiler| » à l'écran
    assert strip_links("next to {{spoiler|Dr. Riggs}}.") == "next to Dr. Riggs."
    assert strip_links("a {{Spoiler|Smashed GATE NVGs}} or other") == "a Smashed GATE NVGs or other"
    assert strip_links("{{stub}} plain") == "plain"


def test_parse_sources_does_not_split_on_abbreviations():
    # « trading with [[Dr. Riggs]] » se coupait en « …with [[Dr. », lien tronqué
    text = ("== Sources ==\n{{PAGENAME}} can be obtained by trading with "
            "[[Dr. Riggs]]. Can also be found in [[Flathill]].\n")
    sources, _ = parse_sources(text, "Potato")
    assert [s["where"][0] for s in sources] == [
        "Potato can be obtained by trading with Dr. Riggs.",
        "Can also be found in Flathill.",
    ]


def test_parse_sources_keeps_initials_together():
    text = "== Sources ==\nDropped by the M.O.P. 9000 robot.\n"
    sources, _ = parse_sources(text, "Bolt")
    assert sources[0]["where"] == ["Dropped by the M.O.P. 9000 robot."]


def test_parse_sources_does_not_invent_a_source_from_initials():
    # « A.E.G.I.S. Helmet can only be obtained through Upgrading. » se coupait
    # après « A.E.G.I.S. », fragment de 10 caractères promu source fantôme —
    # 13 items étaient lootables uniquement à cause de leurs propres initiales
    text = "== Sources ==\n{{PAGENAME}} can only be obtained through Upgrading.\n"
    sources, unknown = parse_sources(text, "A.E.G.I.S. Helmet")
    assert sources == []
    assert unknown == []


# ------------------------------------------------------- image et contenu d'objet

def test_parse_infobox_image_reads_the_infobox():
    page = "{{resourceNode\n|image = Object - Wooden Crate.png\n|type = Destroyable\n}}"
    assert parse_infobox_image(page) == "Object - Wooden Crate.png"


def test_parse_infobox_image_substitutes_pagename():
    # les pages de créatures écrivent leur image en fonction du titre
    assert parse_infobox_image("{{enemy\n| image = {{PAGENAME}}.PNG\n}}", "Pest") == "Pest.PNG"


def test_parse_infobox_image_falls_back_to_a_file_link():
    assert parse_infobox_image("Une page sans infobox [[File:Crate.png|thumb]].") == "Crate.png"
    assert parse_infobox_image("Rien du tout.") is None


DROP_TABLE = """
== Drops ==
{|class="wikitable sortable"
! Item !! Name !! Chance
|-
| {{itemSlot|Wood Plank|text=2-3}} || [[Wood Plank]] || 100% of 2<br>50% of 2-3
|-
| {{itemSlot|Giga Glue|text=0-1}} || [[Giga Glue]] || 50%
|-
|}
"""


def test_parse_drop_table_reads_quantities_and_chances():
    assert parse_drop_table(DROP_TABLE) == [
        # une chance qui n'est pas un pourcentage simple reste une phrase :
        # en tirer un nombre serait inventer
        {"item": "Wood Plank", "qtyMin": 2, "qtyMax": 3,
         "chanceText": "100% of 2 \u00b7 50% of 2-3"},
        {"item": "Giga Glue", "qtyMin": 0, "qtyMax": 1, "chance": 0.5},
    ]


def test_parse_drop_table_ignores_pages_without_such_a_table():
    assert parse_drop_table("== Sources ==\nOn le trouve un peu partout.") == []


def test_parse_object_images_reads_the_shared_list_page():
    """La Wooden Crate n'a pour page qu'une redirection : son image est ici."""
    page = """
{{destroyableObject
|name = [[Wooden Crate]]
|image = Object - Wooden Crate.png
|loot1Item = Duct Tape
}}<!--
-->{{pickupObject
|name = [[Books]]
|image = Object - Books.png
}}
"""
    assert parse_object_images(page) == {
        "Wooden Crate": "Object - Wooden Crate.png",
        "Books": "Object - Books.png",
    }


def test_parse_zone_icon_prefers_the_round_pastille():
    """`{{Sector}}` la met dans son infobox, `{{PortalWorld}}` juste après."""
    sector = "{{Sector\n| image = Icon office sector.png\n}}\nTexte."
    assert parse_zone_icon(sector) == "Icon office sector.png"

    world = ("{{PortalWorld\n| image = Flathill.png\n}}\n"
             "[[File:Icon Flathill.png|128px|left]]\n'''Flathill''' est…")
    assert parse_zone_icon(world) == "Icon Flathill.png"


def test_parse_zone_icon_strips_a_written_out_file_prefix():
    page = "{{PortalWorld\n| image = File:Icon Vignettes.png\n}}"
    assert parse_zone_icon(page) == "Icon Vignettes.png"


def test_parse_zone_icon_falls_back_to_whatever_image_exists():
    page = "{{PortalWorld\n| image = Temple of Stone homeworld.jpg\n}}"
    assert parse_zone_icon(page) == "Temple of Stone homeworld.jpg"
    assert parse_zone_icon("Une page sans la moindre image.") is None


def test_parse_sector_links_reads_the_adjacency_fields():
    page = ("{{Sector\n| image = Icon office sector.png\n"
            "| sector1 = Manufacturing West\n| sector2 = [[Cascade Laboratories]]\n"
            "| sector3 = \n| portalWorld1 = Flathill\n}}")
    assert parse_sector_links(page) == ["Manufacturing West", "Cascade Laboratories"]
    assert parse_sector_links("{{PortalWorld\n| image = x.png\n}}") == []


def test_parse_zone_items_reads_portal_world_infoboxes():
    """Flathill n'a pas de section == Items == : son infobox est la seule liste."""
    page = "{{PortalWorld\n| item1 = Power Cell\n| item2 = Nachos\n| item3 = \n}}"
    assert parse_zone_items(page) == ["Power Cell", "Nachos"]


def test_parse_person_zones_reads_where_a_trader_lives():
    page = "{{Person\n|image=T.png\n|role=F.O.R.G.E.\n|appearance1=Manufacturing West\n}}"
    assert parse_person_zones(page) == ["Manufacturing West"]


def test_zone_mentions_reads_prose_locations():
    """Les pages de créatures nomment leurs zones en puces, sans sous-titres."""
    page = ("== Locations ==\n"
            "* Three are in the central Wildlife Pen in Cascade Laboratories.\n"
            "* One is found in a garage in the [[Hydroplant]].\n"
            "Nothing here should surprise anyone.\n")
    zones = ["Cascade Laboratories", "Hydroplant", "Rise", "Office Sector"]
    # « Rise » ne doit pas matcher « surprise », et rien hors de == Locations ==
    assert zone_mentions(page, zones) == ["Cascade Laboratories", "Hydroplant"]
    # une sous-puce décrit une conséquence, pas un lieu de vie
    sub = ("== Locations ==\n* In the Wildlife Pen.\n"
           "** After completing the Rise, Zombies spawn here.\n")
    assert zone_mentions(sub, zones) == []
    assert zone_mentions("Du lore qui cite [[Rise]] hors section.", zones) == []


def test_prose_restating_the_craft_is_not_a_source():
    """« can only be obtained through mixing » reformule la Chemistry Station :
    la garder fabriquait une source sans géographie, disponible partout."""
    page = ("== Sources ==\n"
            "Acid Coating can only be obtained through mixing. "
            "Alien Distillation can only be obtained through distilling. "
            "It can only be obtained from crafting. "
            "Stun Baton can only be obtained by upgrading. "
            "It is obtained by adding water to a pot, then adding things. "
            "Can also be obtained from breaking [[Computer]].")
    sources, _ = parse_sources(page, "Acid Coating")
    assert [s["kind"] for s in sources] == ["break"]


def test_parse_trade_offers_reads_a_merchant_inventory():
    """Item vendu, coût, déblocage — le rowspan couvre les lignes suivantes."""
    page = """{| class="wikitable"
|-
! Buy !! Cost !! Unlocked
|-
| {{itemSlot|Stapler|text=1}} || {{itemSlot|Raw Antefish Filet|text=1}} || Going through the [[Far Garden]] exit portal
|-
| {{itemSlot|Canned Peas|text=1}} || {{itemSlot|Rootbear|text=1}}
|rowspan=2| Speaking with Warren
|-
| {{itemSlot|Employee Locator|text=1}} || {{itemSlot|Peccary Skull|text=1}}
|-
|}"""
    assert parse_trade_offers(page) == [
        {"item": "Stapler", "costItem": "Raw Antefish Filet", "costQty": "1",
         "unlock": "Going through the Far Garden exit portal"},
        {"item": "Canned Peas", "costItem": "Rootbear", "costQty": "1",
         "unlock": "Speaking with Warren"},
        {"item": "Employee Locator", "costItem": "Peccary Skull", "costQty": "1",
         "unlock": "Speaking with Warren"},
    ]


def test_parse_enemy_stats_reads_the_infobox():
    from parse import parse_enemy_stats
    wikitext = """{{enemy
| name = {{PAGENAME}}
| image = {{PAGENAME}}.PNG
| type = Creature
| codename = IS-0178-A
| identifiedBy = [[Katherine Pendleton|Dr. Kathy "KP" Pendleton]]
| origin = Anteverse 2
| healthHead = 80
| healthTorso = 80
| attackMeleeDamage = 50
| attackMeleeType = Blunt
| weakness = Fire
| resistance =
}}
Du texte ensuite."""
    stats = parse_enemy_stats(wikitext)
    assert stats == {
        "type": "Creature",
        "codename": "IS-0178-A",
        "origin": "Anteverse 2",
        "identifiedBy": 'Dr. Kathy "KP" Pendleton',
        "weakness": ["Fire"],
        "health": {"head": "80", "torso": "80"},
        "melee": {"damage": "50", "type": "Blunt"},
    }
    # name/image ({{PAGENAME}}) et resistance vide ne produisent pas de clé


def test_parse_enemy_stats_splits_lists_and_inline_fields():
    from parse import parse_enemy_stats
    # certaines pages posent plusieurs champs sur la même ligne : la valeur
    # s'arrête au champ suivant, elle ne l'avale pas
    wikitext = """{{enemy
| type = Robot
| weakness = Acid,Blunt, Sharp | immunity = Electricity
}}"""
    stats = parse_enemy_stats(wikitext)
    assert stats == {
        "type": "Robot",
        "weakness": ["Acid", "Blunt", "Sharp"],
        "immunity": ["Electricity"],
    }


def test_parse_enemy_stats_without_infobox():
    from parse import parse_enemy_stats
    assert parse_enemy_stats("{{item\n| name = Truc\n}}") is None


def test_parse_unlocked_by_reads_the_lock_sentence():
    from parse import parse_unlocked_by
    assert parse_unlocked_by(
        "A [[Porcelain Key]] is required to unlock and open the crate."
    ) == "Porcelain Key"
    # l'article s'accorde, le lien peut porter une étiquette
    assert parse_unlocked_by(
        "An [[Inquisitor's Key|key]] is required to unlock and open the crate."
    ) == "Inquisitor's Key"
    # une porte à keypad n'est pas une caisse à clé
    assert parse_unlocked_by(
        "A [[Keypad Hacker (Tier 2)]] is required to open the door.") is None
