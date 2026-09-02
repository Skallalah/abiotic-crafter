import { describe, expect, it } from "vitest";
import { batchDataset, mockupDataset } from "./fixtures";
import { planTotals } from "./plan";
import { craftOrder } from "./totals";
import { Model, type RecipeChoice } from "./tree";

const NO_CHOICE: RecipeChoice = new Map();
const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe("planTotals — la somme des bilans dépliés", () => {
  const model = new Model(mockupDataset("loot"));

  it("somme les besoins de deux objectifs partageant des ingrédients", () => {
    const merged = planTotals(model, [
      { id: "glowstick", qty: 2 },
      { id: "box_of_screws", qty: 1 },
    ], NO_CHOICE);
    expect(asObject(merged.base)).toEqual({
      test_tube: 2, bio_scrap: 2,          // 2 glowsticks
      metal_scrap: 2,                       // 1 box of screws
    });
    expect(asObject(merged.steps)).toEqual({ glowstick: 2, box_of_screws: 1 });
  });

  it("un objectif ×N vaut N bilans, et l'ordre de craft reste sûr", () => {
    const one = planTotals(model, [{ id: "keypad_hacker", qty: 1 }], NO_CHOICE);
    const twice = planTotals(model, [{ id: "keypad_hacker", qty: 2 }], NO_CHOICE);
    for (const [id, qty] of one.base) {
      expect(twice.base.get(id)).toBe(qty * 2);
    }
    // la racine ferme toujours la marche du plan de craft
    expect(craftOrder(twice).at(-1)).toBe("keypad_hacker");
  });

  it("arrondit les recettes à lots PAR objectif — le surcompte est assumé", () => {
    // makes 4 : 3 + 3 munitions en un seul bilan feraient 2 crafts ; en deux
    // objectifs, chacun paie son arrondi (2 + 2 crafts) — la même règle que
    // deux branches d'un arbre réclamant le même intermédiaire
    const batches = new Model(batchDataset());
    const merged = planTotals(batches, [
      { id: "ammo", qty: 3 },
      { id: "ammo", qty: 3 },
    ], NO_CHOICE);
    expect(merged.base.get("powder")).toBe(6);   // 2 crafts... par objectif : 3+3
    expect(merged.steps.get("ammo")).toBe(6);
  });

  it("prend la profondeur maximale quand un item sert deux objectifs", () => {
    // box_of_screws : profondeur 1 comme objectif direct, plus profond sous
    // le keypad — l'ordre de craft doit le placer avant ce qui le consomme
    const merged = planTotals(model, [
      { id: "box_of_screws", qty: 1 },
      { id: "keypad_hacker", qty: 1 },
    ], NO_CHOICE);
    const order = craftOrder(merged);
    expect(order.indexOf("box_of_screws"))
      .toBeLessThan(order.indexOf("controller"));
  });

  it("sans objectif : un bilan vide", () => {
    const merged = planTotals(model, [], NO_CHOICE);
    expect(merged.base.size).toBe(0);
    expect(merged.steps.size).toBe(0);
  });
});
