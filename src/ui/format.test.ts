import { describe, expect, it } from "vitest";
import {
  abbreviation, fold, KIND_KEYWORD, sourceLabel, sourceLine, spotLine, stackText,
} from "./format";
import type { Item, SourceKind } from "../data/types";
import { Model } from "../core/tree";
import { mockupDataset } from "../core/fixtures";
import { dataset } from "../data/load";

const item = (stack: number): Item => ({
  id: "x", name: "X", wikiTitle: "X", category: "c", stack, sources: [],
  meta: { fetchedAt: "", verified: false },
});

describe("abbreviation", () => {
  it("ignore la ponctuation", () => {
    expect(abbreviation("Keypad Hacker (Tier 2)")).toBe("KHT");
    expect(abbreviation("M.O.P. 9000")).toBe("MOP");
    expect(abbreviation(".308 Ammo")).toBe("30A");
  });
  it("gère un et deux mots", () => {
    expect(abbreviation("Glowstick")).toBe("GLO");
    expect(abbreviation("Tech Scrap")).toBe("TES");
  });
});

describe("stackText", () => {
  it("n'affiche rien pour un stack de 1", () => {
    expect(stackText(item(1), 3)).toBe("");
  });
  it("compte les stacks pleins et le reste", () => {
    expect(stackText(item(64), 140)).toBe("2 stacks + 12 (64)");
    expect(stackText(item(64), 128)).toBe("2 stacks (64)");
    expect(stackText(item(64), 10)).toBe("10 / 64");
  });
});

describe("fold", () => {
  it("ignore accents et casse", () => {
    expect(fold("Éclair")).toBe("eclair");
    expect(fold("Éclair").includes(fold("ECLA"))).toBe(true);
  });
});

describe("mots-clés d'obtention", () => {
  const KINDS: SourceKind[] = ["pickup", "break", "drop", "vendor", "salvage", "grow"];
  const model = new Model(mockupDataset("loot"));

  it("donne un mot-clé anglais à chaque nature de source", () => {
    for (const kind of KINDS) {
      expect(KIND_KEYWORD[kind]).toMatch(/^[a-z]+$/);
    }
    expect(KIND_KEYWORD.drop).toBe("kill");
    expect(KIND_KEYWORD.pickup).toBe("loot");
  });

  it("isole le mot-clé dans un span portant sa classe de couleur", () => {
    const li = sourceLine(model, { kind: "drop", target: "Security Bot" });
    const kw = li.querySelector("span")!;
    expect(kw.textContent).toBe("kill");
    expect(kw.className).toBe("kw kw-drop");
    expect(li.textContent).toBe("kill Security Bot");
  });

  it("n'affiche que le mot-clé quand la source ne nomme rien", () => {
    const li = sourceLine(model, { kind: "pickup", zone: "Office Sector" });
    expect(li.textContent).toBe("loot");
    expect(li.textContent).not.toMatch(/[—-]\s*$/);
  });

  it("nomme l'objet démonté et sa quantité pour un salvage", () => {
    const li = sourceLine(model, { kind: "salvage", from: "glowstick", qtyMax: 2 });
    expect(li.textContent).toBe("salvage Glowstick (2)");
  });

  it("garde sourceLabel en texte pur, pour les infobulles", () => {
    expect(sourceLabel(model, { kind: "break", target: "Computer" }))
      .toBe("break Computer");
  });

  it("couvre toutes les natures produites par le vrai dataset", () => {
    const kinds = new Set(
      Object.values(dataset.items).flatMap((i) => i.sources.map((s) => s.kind)),
    );
    for (const kind of kinds) {
      expect(KIND_KEYWORD[kind], `mot-clé manquant pour « ${kind} »`).toBeTruthy();
    }
  });
});


describe("spotLine", () => {
  it("met la sous-zone en avant et garde un séparateur copiable", () => {
    // une première version tirait le séparateur d'un ::before : tout ce qu'on
    // copiait depuis la page revenait collé, « Level 2Data Farms. »
    const li = spotLine("Level 2 › Data Farms.");
    expect(li.querySelector("b")!.textContent).toBe("Level 2");
    expect(li.textContent).toBe("Level 2 » Data Farms.");
  });

  it("laisse tel quel un emplacement sans sous-zone", () => {
    const li = spotLine("In the Botanical Wing.");
    expect(li.querySelector("b")).toBeNull();
    expect(li.textContent).toBe("In the Botanical Wing.");
  });
});
