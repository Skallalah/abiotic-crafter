import { describe, expect, it } from "vitest";
import { cycleDataset, mockupDataset } from "./fixtures";
import { buildTree, Model, type RecipeChoice } from "./tree";
import { computeTotals } from "./totals";
import { groupByZone, OTHER_METHODS } from "./zones";
import { mergeOverrides } from "../data/merge";

const NO_CHOICE: RecipeChoice = new Map();

describe("Model — règles dérivées (§3)", () => {
  const model = new Model(mockupDataset("loot"));

  it("classe correctement craftable, lootable et dual", () => {
    expect(model.isCraftable("keypad_hacker")).toBe(true);
    expect(model.isLootable("keypad_hacker")).toBe(false);
    expect(model.isDual("circuit_board")).toBe(true);
    expect(model.isDual("tech_scrap")).toBe(false);
  });

  it("fait d'un dual `primary: loot` une feuille du bilan", () => {
    expect(model.primaryWay("circuit_board")).toBe("loot");
    expect(model.isLeaf("circuit_board")).toBe(true);
    expect(model.isLeaf("box_of_screws")).toBe(false);
  });

  it("retombe sur loot pour un dual sans primary", () => {
    const ds = mockupDataset("loot");
    delete ds.items.circuit_board!.primary;
    expect(new Model(ds).primaryWay("circuit_board")).toBe("loot");
  });
});

describe("buildTree", () => {
  const model = new Model(mockupDataset("loot"));

  it("indexe le dépli par chemin, pas par item", () => {
    const tree = buildTree(model, "keypad_hacker", NO_CHOICE);
    const paths: string[] = [];
    (function walk(n: typeof tree) {
      paths.push(n.path);
      n.children.forEach(walk);
    })(tree);

    // les trois Computation Brick sont trois chemins distincts
    const bricks = paths.filter((p) => p.endsWith("/computation_brick"));
    expect(bricks).toHaveLength(3);
    expect(new Set(bricks).size).toBe(3);
  });

  it("laisse un dual loot fermé par défaut mais explosable à la demande", () => {
    const closed = buildTree(model, "infrared_emitter", NO_CHOICE);
    const cb = closed.children.find((c) => c.id === "circuit_board")!;
    expect(cb.children).toHaveLength(0);
    expect(cb.alternative).toBe(true);

    const open = buildTree(model, "infrared_emitter", NO_CHOICE, { expandLeafRecipes: true });
    const cbOpen = open.children.find((c) => c.id === "circuit_board")!;
    expect(cbOpen.children.map((c) => c.id)).toEqual(["tech_scrap"]);
  });

  it("porte la quantité de la recette, pas le cumul", () => {
    const tree = buildTree(model, "controller", NO_CHOICE);
    expect(tree.children.find((c) => c.id === "keyboard")!.qty).toBe(2);
  });

  it("coupe à la deuxième occurrence sur un même chemin", () => {
    const model = new Model(cycleDataset());
    const tree = buildTree(model, "a", NO_CHOICE);
    const b = tree.children.find((c) => c.id === "b")!;
    const a2 = b.children.find((c) => c.id === "a")!;
    expect(a2.loop).toBe(true);
    expect(a2.children).toHaveLength(0);
  });
});

describe("Model.usedIn — liens montants", () => {
  const model = new Model(mockupDataset("loot"));

  it("remonte les crafts qui consomment l'item, avec la quantité consommée", () => {
    expect(model.usedIn("computation_brick")).toEqual([
      { item: "controller", qty: 1 },
      { item: "infrared_emitter", qty: 1 },
      { item: "lcd_screen", qty: 1 },
    ]);
    expect(model.usedIn("keyboard")).toEqual([{ item: "controller", qty: 2 }]);
  });

  it("est vide pour un item que personne ne consomme", () => {
    expect(model.usedIn("keypad_hacker")).toEqual([]);
  });

  it("trie par nom", () => {
    const names = model.usedIn("tech_scrap").map((p) => model.item(p.item).name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("ne compte qu'une fois un résultat ayant plusieurs recettes qui consomment l'item", () => {
    const ds = mockupDataset("loot");
    ds.recipes.push({
      id: "r_glowstick_2", kind: "craft",
      output: { item: "glowstick", qty: 1 },
      inputs: [{ item: "test_tube", qty: 4 }],
      bench: "Crafting Bench",
    });
    const parents = new Model(ds).usedIn("test_tube");
    expect(parents).toEqual([{ item: "glowstick", qty: 1 }]);
  });

  it("ignore les recettes d'upgrade, non affichées en v1", () => {
    const ds = mockupDataset("loot");
    ds.recipes.push({
      id: "r_upgrade_1", kind: "upgrade",
      output: { item: "keypad_hacker", qty: 1 },
      inputs: [{ item: "tech_scrap", qty: 4 }],
      bench: "Enhancement Bench",
    });
    expect(new Model(ds).usedIn("tech_scrap").map((p) => p.item))
      .not.toContain("keypad_hacker");
  });

  it("n'affiche jamais l'item comme son propre parent", () => {
    const model = new Model(cycleDataset());
    expect(model.usedIn("a").map((p) => p.item)).toEqual(["b"]);
  });
});

describe("groupByZone (§5.4.3)", () => {
  const model = new Model(mockupDataset("loot"));
  const groups = groupByZone(model, computeTotals(model, "keypad_hacker", NO_CHOICE));

  it("ordonne les zones puis « Autres méthodes »", () => {
    expect(groups.map((g) => g.name)).toEqual([
      "Office Sector", "Manufacturing West", OTHER_METHODS,
    ]);
  });

  it("range le salvage sans zone dans « Autres méthodes »", () => {
    const other = groups.find((g) => g.name === OTHER_METHODS)!;
    expect(other.entries.map((e) => e.id)).toContain("glass_scrap");
  });

  it("marque optionnels les duals qu'on a choisi de crafter", () => {
    const office = groups.find((g) => g.name === "Office Sector")!;
    const screws = office.entries.find((e) => e.id === "box_of_screws")!;
    expect(screws.optional).toBe(true);
    expect(screws.qty).toBe(2);
  });
});

describe("mergeOverrides (§3)", () => {
  const scraped = mockupDataset("loot");

  it("applique un primary absent du scraped", () => {
    delete scraped.items.circuit_board!.primary;
    const merged = mergeOverrides(scraped, {
      items: { circuit_board: { primary: "craft" } },
    });
    expect(new Model(merged).primaryWay("circuit_board")).toBe("craft");
    expect(merged.items.circuit_board!.meta.verified).toBe(true);
  });

  it("remplace les sources en bloc et garde les autres champs", () => {
    const merged = mergeOverrides(scraped, {
      items: { tech_scrap: { sources: [{ kind: "vendor", where: ["Warren"] }] } },
    });
    expect(merged.items.tech_scrap!.sources).toHaveLength(1);
    expect(merged.items.tech_scrap!.name).toBe("Tech Scrap");
    expect(merged.items.tech_scrap!.stack).toBe(64);
  });

  it("ajoute un item absent du scraped", () => {
    const merged = mergeOverrides(scraped, {
      items: { mystery: { name: "Mystery", stack: 4 } },
    });
    expect(merged.items.mystery!.name).toBe("Mystery");
    expect(merged.items.mystery!.id).toBe("mystery");
  });

  it("laisse le dataset intact sans override", () => {
    const merged = mergeOverrides(scraped, {});
    expect(Object.keys(merged.items)).toEqual(Object.keys(scraped.items));
    expect(merged.recipes).toBe(scraped.recipes);
  });
});
