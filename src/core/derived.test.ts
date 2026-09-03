import { describe, expect, it } from "vitest";
import { derivedDataset, discoveryDataset, mockupDataset } from "./fixtures";
import { computeAvailability } from "./discovery";
import { Model, type RecipeChoice } from "./tree";
import { computeTotals } from "./totals";
import {
  containerSources, groupByZone, OTHER_METHODS, sourceZones, zoneContents,
} from "./zones";

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

  it("rattache une méthode sans zone au secteur de son origine", () => {
    // metal_scrap se casse à Office ET se démonte d'un extincteur : la
    // méthode salvage rejoint Manufacturing West, où vivent les extincteurs,
    // au lieu de traîner en « Autres méthodes »
    const office = zone("Office Sector")!;
    expect(office.entries.some((e) => e.id === "metal_scrap")).toBe(true);
    const scrap = zone("Manufacturing West")!.entries
      .find((e) => e.id === "metal_scrap")!;
    expect(scrap.via).toBeUndefined();
    expect(scrap.sources.every((s) => s.kind === "salvage")).toBe(true);
    expect(zone(OTHER_METHODS)?.entries.some((e) => e.id === "metal_scrap"))
      .toBeFalsy();
  });

  it("ne change pas le bilan lui-même", () => {
    expect(Object.fromEntries(totals.base)).toEqual({
      canister: 1, glue: 2, metal_scrap: 4,
    });
  });
});

describe("sourceZones — la géographie d'une méthode", () => {
  const world = new Model(discoveryDataset());
  // « break Mfg Crate » : la source ne porte pas de zone, la caisse si
  const crate = world.item("office_tracker").sources[1]!;

  it("hérite des zones du contenant visé", () => {
    expect(sourceZones(world, crate)).toEqual(["Manufacturing West"]);
  });

  it("rend telle quelle une source déjà localisée", () => {
    expect(sourceZones(world, world.item("looted_office").sources[0]!))
      .toEqual(["Office Sector"]);
  });

  it("reste muette quand l'origine n'a aucun lieu", () => {
    expect(sourceZones(world, world.item("unknown").sources[0]!)).toEqual([]);
  });

  it("ne révèle rien d'une origine hors des zones découvertes", () => {
    const office = computeAvailability(world,
      { enabled: true, zones: new Set(["Office Sector"]) });
    expect(sourceZones(world, crate, office)).toEqual([]);
  });
});

describe("containerSources — les tables de loot complètent les LOOT nus", () => {
  const withContainers = () => {
    const ds = derivedDataset();
    ds.providers = {
      toolbox: { id: "toolbox", name: "Toolbox", kind: "container",
        zones: [{ zone: "Office Sector" }], drops: [{ item: "metal_scrap" }] },
      // sans zone = dans toutes les zones : un vrai générique
      locker: { id: "locker", name: "Locker", kind: "container",
        zones: [], drops: [{ item: "metal_scrap" }] },
      // un cassable n'est pas un contenant à ouvrir
      crate: { id: "crate", name: "Crate", kind: "destroyable",
        zones: [{ zone: "Office Sector" }], drops: [{ item: "metal_scrap" }] },
    };
    return ds;
  };
  const m = new Model(withContainers());

  it("localisé sous sa zone, générique en Autres méthodes, cassable ignoré", () => {
    expect(containerSources(m, "metal_scrap")).toEqual([
      { zone: "Office Sector",
        source: { kind: "pickup", target: "Toolbox", targetId: "toolbox" } },
      { zone: OTHER_METHODS,
        source: { kind: "pickup", target: "Locker", targetId: "locker" } },
    ]);
  });

  it("ignore un contenant déjà cité par une source explicite", () => {
    const ds = withContainers();
    ds.items.metal_scrap!.sources.push(
      { kind: "pickup", target: "Toolbox", targetId: "toolbox" });
    expect(containerSources(new Model(ds), "metal_scrap")
      .some((c) => c.source.targetId === "toolbox")).toBe(false);
  });

  it("au bilan : la ligne rejoint la zone, le générique fait une entrée à part", () => {
    const groups = groupByZone(m, computeTotals(m, "gadget", NO_CHOICE));
    const office = groups.find((g) => g.name === "Office Sector")!;
    expect(office.entries.find((e) => e.id === "metal_scrap")!
      .sources.some((s) => s.targetId === "toolbox")).toBe(true);
    const other = groups.find((g) => g.name === OTHER_METHODS)!;
    expect(other.entries.find((e) => e.id === "metal_scrap")!
      .sources.some((s) => s.targetId === "locker")).toBe(true);
  });

  it("zone non découverte : le contenant se tait, le générique reste", () => {
    const nothing = computeAvailability(m, { enabled: true, zones: new Set() });
    const got = containerSources(m, "metal_scrap", nothing);
    expect(got.some((c) => c.source.targetId === "toolbox")).toBe(false);
    expect(got.some((c) => c.source.targetId === "locker")).toBe(true);
  });
});

describe("zoneContents — l'inventaire d'un secteur", () => {
  const sector = () => {
    const ds = mockupDataset();
    // certifiés « posés dans le décor » par === Environment ===
    ds.items.tech_scrap!.sources[0]!.env = true;
    ds.items.test_tube!.sources.push(
      { kind: "pickup", zone: "Office Sector", env: true });
    // un marchand, cité deux fois : une seule ligne
    ds.items.glowstick!.sources.push(
      { kind: "vendor", zone: "Office Sector", target: "Warren Bunning" });
    ds.items.keyboard!.sources.push(
      { kind: "vendor", zone: "Office Sector", target: "Warren Bunning" });
    // un contenant et une prise à dépecer, pour couvrir chaque famille
    ds.providers.office_locker = {
      id: "office_locker", name: "Office Locker", kind: "container",
      zones: [{ zone: "Office Sector" }], drops: [],
    };
    ds.providers.peccary = {
      id: "peccary", name: "Peccary", kind: "butcher",
      zones: [{ zone: "Office Sector" }], drops: [],
    };
    return new Model(ds);
  };
  const m = sector();
  const office = zoneContents(m, "Office Sector");

  it("sépare le décor certifié du simple « trouvable ici », sans doublon", () => {
    // test_tube a un pickup vague ET un certifié : le certifié l'emporte
    expect(office.env).toEqual(["tech_scrap", "test_tube"]);
    expect(office.somewhere).toEqual(["box_of_screws", "desk_phone", "keyboard"]);
  });

  it("n'invente pas d'item depuis les sources break/drop de la zone", () => {
    // metal_scrap se casse à Office, mais n'y est pas « posé quelque part »
    expect([...office.env, ...office.somewhere]).not.toContain("metal_scrap");
  });

  it("regroupe les providers du secteur par famille, triés par nom", () => {
    expect(office.containers.map((p) => p.id)).toEqual(["office_locker"]);
    expect(office.creatures.map((p) => p.id)).toEqual(["peccary", "security_bot"]);
    expect(office.nodes.map((p) => p.id)).toEqual(["computer"]);
    // le Computer vit aussi à Manufacturing West
    expect(zoneContents(m, "Manufacturing West").nodes.map((p) => p.id))
      .toEqual(["computer"]);
  });

  it("liste chaque marchand une fois, avec ses échanges", () => {
    // la fenêtre doit pouvoir demander à la découverte s'il est déjà là
    expect(office.traders.map((t) => t.name)).toEqual(["Warren Bunning"]);
    // les deux échanges qui le citent, pour le test de disponibilité
    expect(office.traders[0]!.sources).toHaveLength(2);
    expect(office.traders[0]!.sources.every((s) => s.kind === "vendor")).toBe(true);
    expect(zoneContents(m, "Manufacturing West").traders).toEqual([]);
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
