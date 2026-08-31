import { describe, expect, it } from "vitest";
import { derivedDataset, mockupDataset } from "./fixtures";
import { Model, type RecipeChoice } from "./tree";
import { computeTotals } from "./totals";
import { groupByZone, OTHER_METHODS } from "./zones";

const NO_CHOICE: RecipeChoice = new Map();
const model = new Model(derivedDataset());

describe("Model — objets dérivés", () => {
  it("reconnaît un objet qu'on n'obtient qu'en transformant un autre", () => {
    expect(model.isDerived("canister")).toBe(true);
    expect(model.isDerived("glue")).toBe(true);
    expect(model.isDerived("metal_scrap")).toBe(false); // il a une source directe
    expect(model.isDerived("fire_extinguisher")).toBe(false);
  });

  it("ne considère pas une origine absente du dataset", () => {
    const ds = derivedDataset();
    ds.items.canister!.sources = [{ kind: "salvage", from: "inconnu" }];
    const m = new Model(ds);
    expect(m.originOf(ds.items.canister!.sources[0]!)).toBeUndefined();
    expect(m.isDerived("canister")).toBe(false);
  });

  it("rend l'origine avec ses propres sources, celles qui portent le lieu", () => {
    const [first] = model.collectibles("canister");
    expect(first!.origin).toBe("fire_extinguisher");
    expect(first!.sources[0]!.zone).toBe("Manufacturing West");
  });

  it("dédoublonne les origines répétées", () => {
    const ds = derivedDataset();
    ds.items.canister!.sources = [
      { kind: "salvage", from: "fire_extinguisher", qtyMin: 1, qtyMax: 1 },
      { kind: "break", from: "fire_extinguisher", qtyMin: 2, qtyMax: 2 },
    ];
    expect(new Model(ds).collectibles("canister")).toHaveLength(1);
  });
});

describe("groupByZone — placement indirect", () => {
  const totals = computeTotals(model, "gadget", NO_CHOICE);
  const groups = groupByZone(model, totals);
  const zone = (name: string) => groups.find((g) => g.name === name);

  it("range le dérivé sous la zone de son origine, pas dans « Autres méthodes »", () => {
    const mw = zone("Manufacturing West")!;
    const canister = mw.entries.find((e) => e.id === "canister")!;
    expect(canister.via?.origin).toBe("fire_extinguisher");
    expect(canister.qty).toBe(1);
    expect(zone(OTHER_METHODS)?.entries.some((e) => e.id === "canister")).toBeFalsy();
  });

  it("garde le chemin exact : par quoi on passe pour obtenir le dérivé", () => {
    const canister = zone("Manufacturing West")!.entries.find((e) => e.id === "canister")!;
    expect(canister.via!.through.kind).toBe("salvage");
    expect(canister.via!.sources[0]!.zone).toBe("Manufacturing West");
  });

  it("laisse dans « Autres méthodes » un dérivé dont l'origine n'a aucun lieu", () => {
    const other = zone(OTHER_METHODS)!;
    const glue = other.entries.find((e) => e.id === "glue")!;
    expect(glue.via).toBeUndefined();
  });

  it("n'ajoute aucune zone indirecte à un item déjà localisé", () => {
    const office = zone("Office Sector")!;
    expect(office.entries.some((e) => e.id === "metal_scrap")).toBe(true);
    const mw = zone("Manufacturing West")!;
    expect(mw.entries.some((e) => e.id === "metal_scrap" && e.via)).toBe(false);
  });

  it("ne change pas le bilan lui-même", () => {
    expect(Object.fromEntries(totals.base)).toEqual({
      canister: 1, glue: 2, metal_scrap: 4,
    });
  });
});

describe("non-régression", () => {
  it("laisse le bilan du mockup intact", () => {
    const m = new Model(mockupDataset("loot"));
    const totals = computeTotals(m, "keypad_hacker", NO_CHOICE);
    expect(totals.base.get("circuit_board")).toBe(10);
    expect(groupByZone(m, totals).every((g) => g.entries.every((e) => !e.via))).toBe(true);
  });
});
