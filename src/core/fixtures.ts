import type { Dataset, Item, Provider, Recipe, Source } from "../data/types";

/** Jeu de données du mockup transposé au schéma §3, pour les tests. */

function item(id: string, name: string, stack: number, sources: Source[] = [],
              primary?: "craft" | "loot"): Item {
  return {
    id, name, wikiTitle: name.replace(/ /g, "_"),
    category: "Test", stack, sources, primary,
    meta: { fetchedAt: "2026-08-31T00:00:00Z", verified: true },
  };
}

function recipe(output: string, inputs: [string, number][], bench = "Crafting Bench",
                outQty = 1, n = 1): Recipe {
  return {
    id: `r_${output}_${n}`, kind: "craft",
    output: { item: output, qty: outQty },
    inputs: inputs.map(([i, q]) => ({ item: i, qty: q })),
    bench,
  };
}

const office = (where: string): Source[] =>
  [{ kind: "pickup", zone: "Office Sector", where: [where] }];

export function mockupDataset(circuitBoardPrimary: "craft" | "loot" = "loot"): Dataset {
  const items: Record<string, Item> = {};
  const add = (it: Item) => { items[it.id] = it; };

  add(item("keypad_hacker", "Keypad Hacker", 1));
  add(item("controller", "Controller", 3));
  add(item("lcd_screen", "LCD Screen", 3));
  add(item("infrared_emitter", "Infrared Emitter", 3));
  add(item("computation_brick", "Computation Brick", 16));
  add(item("glowstick", "Glowstick", 10));

  add(item("box_of_screws", "Box of Screws", 64, office("Bureaux L2–L3"), "craft"));
  add(item("circuit_board", "Circuit Board", 64,
      [{ kind: "break", zone: "Office Sector", target: "Computer", targetId: "computer" }],
      circuitBoardPrimary));

  add(item("security_bot_cpu", "Security Bot CPU", 8,
      [{ kind: "drop", zone: "Office Sector", target: "Security Bot" }]));
  add(item("case_fan", "Case Fan", 8, [{ kind: "break", zone: "Office Sector", target: "PC" }]));
  add(item("keyboard", "Keyboard", 5, office("Sur les bureaux")));
  add(item("desk_phone", "Desk Phone", 5, office("Sur les bureaux")));
  add(item("tech_scrap", "Tech Scrap", 64, office("Salvage d'électronique")));
  add(item("metal_scrap", "Metal Scrap", 64, [
    { kind: "break", zone: "Office Sector", target: "Chaise" },
    { kind: "break", zone: "Manufacturing West", where: ["Partout"] },
  ]));
  add(item("glass_scrap", "Glass Scrap", 64, [{ kind: "salvage", from: "glowstick" }]));
  add(item("test_tube", "Test Tube", 10, office("Laboratoires L1")));
  add(item("bio_scrap", "Bio Scrap", 64, [{ kind: "drop", zone: "Office Sector", target: "Peccary" }]));

  const recipes: Recipe[] = [
    recipe("keypad_hacker", [["controller", 1], ["lcd_screen", 1], ["infrared_emitter", 1]]),
    recipe("controller", [["computation_brick", 1], ["keyboard", 2], ["desk_phone", 2], ["box_of_screws", 1]]),
    recipe("lcd_screen", [["computation_brick", 1], ["tech_scrap", 3], ["glowstick", 1], ["box_of_screws", 1]]),
    recipe("infrared_emitter", [["circuit_board", 1], ["computation_brick", 1], ["glass_scrap", 2]]),
    recipe("computation_brick", [["security_bot_cpu", 1], ["circuit_board", 3], ["tech_scrap", 1], ["case_fan", 1]]),
    recipe("glowstick", [["test_tube", 1], ["bio_scrap", 1]], "Inventory or Crafting Bench"),
    recipe("box_of_screws", [["metal_scrap", 2]]),
    recipe("circuit_board", [["tech_scrap", 8]]),
  ];

  const zones = [
    { name: "Office Sector", order: 0, icon: "Icon_office_sector.png", color: "#3177a3" },
    { name: "Manufacturing West", order: 1 },   // sans pastille : cas à couvrir
  ];

  const providers: Record<string, Provider> = {
    computer: {
      id: "computer", name: "Computer", kind: "destroyable",
      wikiTitle: "Computer",
      zones: [
        { zone: "Office Sector", where: ["Level 2 › Data Farm"] },
        // une seconde zone, sans emplacement : elle doit rester visible
        { zone: "Manufacturing West" },
      ],
      drops: [
        { item: "circuit_board", qtyMin: 1, qtyMax: 1, chance: 1 },
        { item: "case_fan", qtyMin: 1, qtyMax: 2, chance: 0.5 },
      ],
    },
  };

  return { items, recipes, zones, providers };
}

/**
 * Un objet purement dérivé (Canister) dont l'origine (Fire Extinguisher) est la
 * seule à porter une zone — le cas qui motive la fonctionnalité.
 */
export function derivedDataset(): Dataset {
  const items: Record<string, Item> = {
    gadget: item("gadget", "Gadget", 1),
    canister: item("canister", "Canister", 16, [
      { kind: "salvage", from: "fire_extinguisher", target: "Fire Extinguisher", qtyMin: 1, qtyMax: 1 },
    ]),
    fire_extinguisher: item("fire_extinguisher", "Fire Extinguisher", 1, [
      { kind: "pickup", zone: "Manufacturing West", where: ["Le long des murs"] },
    ]),
    // origine sans lieu connu : seule issue, la fabriquer
    glue: item("glue", "Glue", 16, [{ kind: "salvage", from: "waders", qtyMin: 0, qtyMax: 3 }]),
    waders: item("waders", "Waders", 1),
    // item déjà localisé : il ne doit rien hériter
    metal_scrap: item("metal_scrap", "Metal Scrap", 64, [
      { kind: "break", zone: "Office Sector", target: "Chaise" },
      { kind: "salvage", from: "fire_extinguisher", qtyMin: 2, qtyMax: 2 },
    ]),
  };
  return {
    items,
    recipes: [
      recipe("gadget", [["canister", 1], ["glue", 2], ["metal_scrap", 4]]),
      recipe("waders", [["metal_scrap", 2]]),
    ],
    zones: [
      { name: "Office Sector", order: 0 },
      { name: "Manufacturing West", order: 1 },
    ],
    providers: {},
  };
}

/** Recette produisant 4 unités par craft, pour le test d'arrondi. */
export function batchDataset(): Dataset {
  const items: Record<string, Item> = {
    ammo: item("ammo", "Ammo", 64),
    powder: item("powder", "Powder", 64, office("Partout")),
    casing: item("casing", "Casing", 64, office("Partout")),
  };
  return {
    items,
    recipes: [recipe("ammo", [["powder", 3], ["casing", 1]], "Ammo Station", 4)],
    zones: [{ name: "Office Sector", order: 0 }],
    providers: {},
  };
}

/** A → B → A, cycle impossible via craft normal mais possible via override. */
export function cycleDataset(): Dataset {
  const items: Record<string, Item> = {
    a: item("a", "A", 10),
    b: item("b", "B", 10),
    filler: item("filler", "Filler", 10, office("Partout")),
  };
  return {
    items,
    recipes: [
      recipe("a", [["b", 1], ["filler", 1]]),
      recipe("b", [["a", 1], ["filler", 2]]),
    ],
    zones: [{ name: "Office Sector", order: 0 }],
    providers: {},
  };
}

/**
 * Petit monde pour la découverte : deux secteurs liés en sens unique, un monde-
 * portail, une zone orpheline, et un item par règle du point fixe.
 */
export function discoveryDataset(): Dataset {
  const items: Record<string, Item> = {};
  const add = (it: Item) => { items[it.id] = it; };

  add(item("looted_office", "Looted Office", 8,
      [{ kind: "pickup", zone: "Office Sector" }]));
  add(item("looted_mfg", "Looted Mfg", 8,
      [{ kind: "pickup", zone: "Manufacturing West" }]));
  // dérive d'un item : disponible quand son origine l'est
  add(item("derived", "Derived", 8, [{ kind: "salvage", from: "looted_mfg" }]));
  // vise un contenant sans porter de zone : suit le contenant
  add(item("via_crate", "Via Crate", 8,
      [{ kind: "break", target: "Mfg Crate", targetId: "mfg_crate" }]));
  // aucune source : uniquement lâché par le contenant
  add(item("dropped", "Dropped", 8));
  // prose sans la moindre géographie : jamais caché
  add(item("unknown", "Unknown", 8, [{ kind: "vendor", target: "A Vendor" }]));
  // craftable : disponible quand TOUS ses ingrédients le sont
  add(item("crafted", "Crafted", 1));
  // ni source, ni recette, ni drop : la donnée ne sait rien, jamais caché
  add(item("nowhere", "Nowhere", 1));
  // lâché par une créature jamais localisée ET lootable dans Manufacturing :
  // seule la zone doit compter, la créature sans zone ne prouve rien
  add(item("leech_loot", "Leech Loot", 8, [
    { kind: "drop", target: "Ghost", targetId: "ghost" },
    { kind: "pickup", zone: "Manufacturing West" },
  ]));
  // cible nommée mais jamais résolue (« kill Order ») : pas un lieu inconnu
  add(item("faction_drop", "Faction Drop", 8, [
    { kind: "drop", target: "Order" },
    { kind: "pickup", zone: "Manufacturing West" },
  ]));
  // ne sort que d'une amélioration : suit ses ingrédients comme un craft
  add(item("upgraded", "Upgraded", 1));
  // feuille que la donnée ne sait pas localiser : toujours visible
  add(item("phantom", "Phantom", 1, [{ kind: "pickup", target: "Pest (Pet)" }]));
  // pur craft jamais-localisable : seule sa recette peut le justifier
  add(item("ghost_gadget", "Ghost Gadget", 1));
  // drop soumis à une condition de quête : ne prouve rien, la vraie zone si
  add(item("gated_loot", "Gated Loot", 1, [
    { kind: "drop", zone: "Manufacturing West", target: "Mfg Crate",
      targetId: "mfg_crate", conditional: true },
    { kind: "pickup", zone: "The Deep" },
  ]));

  const providers: Record<string, Provider> = {
    mfg_crate: {
      id: "mfg_crate", name: "Mfg Crate", kind: "destroyable",
      zones: [{ zone: "Manufacturing West" }],
      drops: [
        { item: "dropped" },
        // la chance sans « % » est une condition de progression
        { item: "gated_loot", chanceText: "Completing Canaan" },
      ],
    },
    // aucun lieu déclaré : les casiers génériques existent partout
    generic: { id: "generic", name: "Generic", kind: "container", zones: [], drops: [] },
    // une créature sans zone, elle, vit quelque part : elle ne prouve rien
    ghost: { id: "ghost", name: "Ghost", kind: "enemy", zones: [], drops: [] },
  };

  return {
    items,
    recipes: [
      recipe("crafted", [["looted_office", 1], ["looted_mfg", 1]]),
      { id: "u_upgraded_1", kind: "upgrade", output: { item: "upgraded", qty: 1 },
        inputs: [{ item: "looted_mfg", qty: 1 }], bench: "Enhancement Bench" },
      recipe("ghost_gadget", [["phantom", 1], ["looted_mfg", 1]]),
    ],
    zones: [
      // lien déclaré en sens unique, comme The Encroachment sur le wiki
      { name: "Office Sector", order: 0, links: ["Manufacturing West"] },
      { name: "Manufacturing West", order: 1 },
      { name: "Far Garden", order: 2, parent: "Office Sector" },
      { name: "Uncharted Place", order: 3 },
      // accessible seulement via Manufacturing : teste le « rien au-delà »
      { name: "The Deep", order: 4, links: ["Manufacturing West"] },
    ],
    providers,
  };
}
