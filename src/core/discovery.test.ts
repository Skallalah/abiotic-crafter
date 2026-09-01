import { describe, expect, it } from "vitest";
import { computeAvailability, frontier } from "./discovery";
import { discoveryDataset } from "./fixtures";
import { Model } from "./tree";
import { OTHER_METHODS } from "./zones";

const model = new Model(discoveryDataset());
const state = (...zones: string[]) => ({ enabled: true, zones: new Set(zones) });

describe("frontière", () => {
  it("propose les voisins, le lien étant lu dans les deux sens", () => {
    // Office déclare Manufacturing ; Manufacturing ne déclare rien — comme
    // The Encroachment sur le wiki
    const fromOffice = frontier(model, state("Office Sector"));
    expect(fromOffice.map((f) => f.zone))
      .toEqual(["Manufacturing West", "Far Garden", "Uncharted Place"]);

    const fromMfg = frontier(model, state("Manufacturing West"));
    expect(fromMfg.map((f) => f.zone))
      .toEqual(["Office Sector", "Uncharted Place", "The Deep"]);
  });

  it("relie un monde-portail à son secteur, dans les deux sens", () => {
    const fromVerse = frontier(model, state("Far Garden"));
    expect(fromVerse.map((f) => f.zone)).toContain("Office Sector");
    expect(fromVerse.map((f) => f.zone)).not.toContain("Manufacturing West");
  });

  it("propose toujours les orphelines, marquées uncharted", () => {
    for (const zones of [["Office Sector"], ["Far Garden"]]) {
      const entry = frontier(model, state(...zones)).find((f) => f.zone === "Uncharted Place");
      expect(entry).toEqual({ zone: "Uncharted Place", uncharted: true });
    }
  });

  it("ne repropose jamais une zone découverte", () => {
    const entries = frontier(model, state("Office Sector", "Manufacturing West"));
    expect(entries.map((f) => f.zone))
      .toEqual(["Far Garden", "Uncharted Place", "The Deep"]);
  });
});

describe("disponibilité", () => {
  const office = computeAvailability(model, state("Office Sector"));
  const both = computeAvailability(model, state("Office Sector", "Manufacturing West"));

  it("suit la zone directe d'une source", () => {
    expect(office.item("looted_office")).toBe(true);
    expect(office.item("looted_mfg")).toBe(false);
    expect(both.item("looted_mfg")).toBe(true);
  });

  it("suit une chaîne from jusqu'à son origine", () => {
    expect(office.item("derived")).toBe(false);
    expect(both.item("derived")).toBe(true);
  });

  it("suit un contenant, par sa cible comme par ses drops", () => {
    expect(office.provider("mfg_crate")).toBe(false);
    expect(office.item("via_crate")).toBe(false);
    expect(office.item("dropped")).toBe(false);
    expect(both.provider("mfg_crate")).toBe(true);
    expect(both.item("via_crate")).toBe(true);
    expect(both.item("dropped")).toBe(true);
  });

  it("un contenant sans lieu déclaré existe partout", () => {
    expect(office.provider("generic")).toBe(true);
  });

  it("rend un craft disponible quand tous ses ingrédients le sont", () => {
    expect(office.item("crafted")).toBe(false);
    expect(both.item("crafted")).toBe(true);
  });

  it("ne cache jamais ce que la donnée ne sait pas localiser", () => {
    // prose sans géographie, et item sans la moindre information
    expect(office.item("unknown")).toBe(true);
    expect(office.item("nowhere")).toBe(true);
  });

  it("filtre les sources par leur zone, et laisse passer les autres", () => {
    expect(office.source({ kind: "pickup", zone: "Manufacturing West" })).toBe(false);
    expect(office.source({ kind: "pickup", zone: "Office Sector" })).toBe(true);
    expect(office.source({ kind: "salvage", from: "x" })).toBe(true);
    expect(office.zone(OTHER_METHODS)).toBe(true);
  });
});

describe("invariants", () => {
  it("suivi désactivé : tout est disponible", () => {
    const off = computeAvailability(model, { enabled: false, zones: new Set() });
    for (const id of Object.keys(model.ds.items)) expect(off.item(id)).toBe(true);
    expect(off.zone("Manufacturing West")).toBe(true);
  });

  it("toutes zones découvertes : tout est disponible", () => {
    const all = computeAvailability(model,
      state(...model.ds.zones.map((z) => z.name)));
    for (const id of Object.keys(model.ds.items)) {
      expect(all.item(id), id).toBe(true);
    }
  });
});
