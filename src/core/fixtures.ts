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
    { name: "Office Sector", order: 0 },
    { name: "Manufacturing West", order: 1 },
  ];

  const providers: Record<string, Provider> = {
    computer: {
      id: "computer", name: "Computer", kind: "destroyable",
      wikiTitle: "Computer", zones: ["Office Sector"],
      where: ["Level 2 › Data Farm"],
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
