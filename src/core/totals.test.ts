import { describe, expect, it } from "vitest";
import { batchDataset, cycleDataset, mockupDataset } from "./fixtures";
import { computeTotals, craftOrder } from "./totals";
import { buildTree, Model, type RecipeChoice } from "./tree";

const NO_CHOICE: RecipeChoice = new Map();
const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe("computeTotals — arbre du Keypad Hacker (§7)", () => {
  it("donne exactement le bilan du mockup avec Circuit Board en loot", () => {
    const model = new Model(mockupDataset("loot"));
    const { base, steps } = computeTotals(model, "keypad_hacker", NO_CHOICE);

    expect(asObject(base)).toEqual({
      circuit_board: 10, tech_scrap: 6, metal_scrap: 4, security_bot_cpu: 3,
      case_fan: 3, keyboard: 2, desk_phone: 2, glass_scrap: 2,
      test_tube: 1, bio_scrap: 1,
    });
    expect(asObject(steps)).toEqual({
      computation_brick: 3, box_of_screws: 2, glowstick: 1, controller: 1,
      lcd_screen: 1, infrared_emitter: 1, keypad_hacker: 1,
    });
  });

  it("bascule sur 86 Tech Scrap quand Circuit Board passe en craft", () => {
    const model = new Model(mockupDataset("craft"));
    const { base, steps } = computeTotals(model, "keypad_hacker", NO_CHOICE);

    expect(base.get("tech_scrap")).toBe(86);
    expect(base.has("circuit_board")).toBe(false);
    expect(steps.get("circuit_board")).toBe(10);
  });

  it("ordonne les crafts après leurs dépendances", () => {
    const model = new Model(mockupDataset("loot"));
    const totals = computeTotals(model, "keypad_hacker", NO_CHOICE);
    const order = craftOrder(totals);

    expect(order.at(-1)).toBe("keypad_hacker");
    for (const recipe of model.ds.recipes) {
      const target = order.indexOf(recipe.output.item);
      if (target < 0) continue;
      for (const input of recipe.inputs) {
        const source = order.indexOf(input.item);
        if (source >= 0) expect(source).toBeLessThan(target);
      }
    }
  });
});

describe("computeTotals — cas limites", () => {
  it("compte des crafts, pas des unités, quand output.qty > 1", () => {
    const model = new Model(batchDataset());
    const { base, steps } = computeTotals(model, "ammo", NO_CHOICE, 5);

    // 5 munitions demandées, 4 par craft → 2 crafts, ingrédients ×2
    expect(steps.get("ammo")).toBe(5);
    expect(base.get("powder")).toBe(6);
    expect(base.get("casing")).toBe(2);
  });

  it("ne descend qu'un seul craft quand la quantité tient dedans", () => {
    const model = new Model(batchDataset());
    const { base } = computeTotals(model, "ammo", NO_CHOICE, 4);
    expect(base.get("powder")).toBe(3);
  });

  it("termine sur un cycle et le signale", () => {
    const model = new Model(cycleDataset());
    const { base, steps, loops } = computeTotals(model, "a", NO_CHOICE);

    expect(loops.has("a")).toBe(true);
    expect(steps.get("a")).toBe(1);
    expect(steps.get("b")).toBe(1);
    expect(base.get("a")).toBe(1);       // la 2e occurrence devient une feuille
    expect(base.get("filler")).toBe(3);
  });
});

describe("le bilan suit le dépli de l'arbre", () => {
  const model = new Model(mockupDataset("loot"));

  /** Tous les chemins dépliables, comme le fait « Tout exploser ». */
  const allPaths = (root: string): Set<string> => {
    const out = new Set<string>();
    (function walk(node: ReturnType<typeof buildTree>) {
      if (node.recipe && !node.loop) {
        out.add(node.path);
        node.children.forEach(walk);
      }
    })(buildTree(model, root, NO_CHOICE));
    return out;
  };

  it("ne décompose pas un nœud replié : il devient un objet à se procurer", () => {
    // racine seule dépliée : on voit ses trois composants entiers
    const { base, steps } = computeTotals(
      model, "keypad_hacker", NO_CHOICE, 1, new Set(["keypad_hacker"]),
    );
    expect(asObject(base)).toEqual({
      controller: 1, lcd_screen: 1, infrared_emitter: 1,
    });
    expect(asObject(steps)).toEqual({ keypad_hacker: 1 });
  });

  it("descend d'un cran de plus quand on déplie un composant", () => {
    const { base, steps } = computeTotals(
      model, "keypad_hacker", NO_CHOICE, 1,
      new Set(["keypad_hacker", "keypad_hacker/controller"]),
    );
    expect(asObject(steps)).toEqual({ keypad_hacker: 1, controller: 1 });
    expect(base.get("computation_brick")).toBe(1);
    expect(base.get("keyboard")).toBe(2);
    expect(base.get("lcd_screen")).toBe(1);      // toujours replié
  });

  it("retrouve le bilan complet quand tout est déplié", () => {
    const complet = computeTotals(model, "keypad_hacker", NO_CHOICE);
    const deplie = computeTotals(
      model, "keypad_hacker", NO_CHOICE, 1, allPaths("keypad_hacker"),
    );
    expect(asObject(deplie.base)).toEqual(asObject(complet.base));
    expect(asObject(deplie.steps)).toEqual(asObject(complet.steps));
  });

  it("emploie le même schéma de chemins que l'arbre affiché", () => {
    // si les deux parcours divergeaient, la colonne de droite ne décrirait plus
    // l'arbre du milieu : tout chemin de l'arbre doit être compris du bilan
    const paths = allPaths("keypad_hacker");
    expect(paths.has("keypad_hacker")).toBe(true);
    expect(paths.has("keypad_hacker/controller/computation_brick")).toBe(true);
    for (const path of paths) {
      const partiel = computeTotals(model, "keypad_hacker", NO_CHOICE, 1, new Set([path]));
      // un chemin inconnu du bilan ne déplierait rien : la racine resterait seule
      if (path === "keypad_hacker") expect(partiel.steps.size).toBe(1);
      else expect(partiel.steps.size).toBe(0);
    }
  });

  it("garde un bilan complet quand on ne lui passe pas de dépli", () => {
    const sansDepli = computeTotals(model, "keypad_hacker", NO_CHOICE);
    expect(sansDepli.base.get("tech_scrap")).toBe(6);
  });

  it("suit la recette choisie quand un item en a plusieurs", () => {
    const ds = mockupDataset("craft");
    ds.recipes.push({
      id: "r_circuit_board_2", kind: "craft",
      output: { item: "circuit_board", qty: 1 },
      inputs: [{ item: "metal_scrap", qty: 5 }],
      bench: "Crafting Bench",
    });
    const model = new Model(ds);

    const first = computeTotals(model, "circuit_board", NO_CHOICE);
    expect(first.base.get("tech_scrap")).toBe(8);

    const second = computeTotals(model, "circuit_board", new Map([["circuit_board", 1]]));
    expect(second.base.get("metal_scrap")).toBe(5);
  });
});
