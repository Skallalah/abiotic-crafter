import { describe, expect, it } from "vitest";
import {
  abbreviation, fold, KIND_KEYWORD, redactor, sourceLabel, sourceLine, spotLine,
  stackText, zoneTag,
} from "./format";
import type { Item, SourceKind } from "../data/types";
import { computeAvailability } from "../core/discovery";
import { Model } from "../core/tree";
import { discoveryDataset, mockupDataset } from "../core/fixtures";
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


describe("zoneTag", () => {
  const model = new Model(mockupDataset());

  it("porte la pastille et la couleur de la zone", () => {
    const tag = zoneTag(model, "Office Sector");
    expect(tag.textContent).toBe("Office Sector");
    expect(tag.querySelector("img")!.getAttribute("src")).toBe("/Icon_office_sector.png");
    expect(tag.style.getPropertyValue("--zone")).toBe("#3177a3");
  });

  it("se contente du nom quand le wiki n'a ni l'une ni l'autre", () => {
    const tag = zoneTag(model, "Manufacturing West");
    expect(tag.textContent).toBe("Manufacturing West");
    expect(tag.querySelector("img")).toBeNull();
    expect(tag.style.getPropertyValue("--zone")).toBe("");
  });

  it("ne prête ni pastille ni couleur à « Other methods »", () => {
    // ce n'est pas un lieu du jeu, seulement un fourre-tout du bilan
    const tag = zoneTag(model, "Other methods");
    expect(tag.querySelector("img")).toBeNull();
    expect(tag.style.getPropertyValue("--zone")).toBe("");
  });
});


describe("origine d'un salvage", () => {
  const model = new Model(dataset);

  it("est un lien : sélection au clic, fenêtre au clic droit", () => {
    // « salvage Pocket Watch (1) » était du texte mort, alors que « break
    // Manufacturing Wood Crate » était cliquable sur la même ligne
    const picked: string[] = [];
    const li = sourceLine(model,
      { kind: "salvage", from: "pocket_watch", qtyMax: 1 },
      undefined, (id) => picked.push(id));
    const link = li.querySelector<HTMLButtonElement>("button.link")!;
    expect(link.dataset.item).toBe("pocket_watch");
    expect(link.textContent).toContain("Pocket Watch");
    link.click();
    expect(picked).toEqual(["pocket_watch"]);
  });

  it("reste au moins ciblable au clic droit sans rappel de sélection", () => {
    const li = sourceLine(model, { kind: "salvage", from: "pocket_watch" });
    expect(li.querySelector("button")).toBeNull();
    expect(li.querySelector<HTMLElement>("[data-item]")!.dataset.item).toBe("pocket_watch");
  });
});


describe("caviardage des phrases d'obtention", () => {
  const world = new Model(discoveryDataset());
  const office = computeAvailability(world,
    { enabled: true, zones: new Set(["Office Sector"]) });

  const text = (parts: (string | Node)[]) => parts
    .map((p) => typeof p === "string" ? p : (p as HTMLElement).outerHTML).join("");

  it("remplace les noms d'items indisponibles et de zones non découvertes", () => {
    // « salvaging a Pocket Watch or Witch Skull » : le flou ne peut rien pour
    // de la prose, le nom y est en toutes lettres
    const redact = redactor(world, office);
    expect(text(redact("Salvage a Looted Mfg near Manufacturing West.")))
      .toBe('Salvage a <span class="redacted">[REDACTED]</span> near '
          + '<span class="redacted">[REDACTED]</span>.');
    // un nom disponible reste en clair
    expect(text(redact("A Looted Office sits in Office Sector.")))
      .toBe("A Looted Office sits in Office Sector.");
  });

  it("ne caviarde rien quand le suivi est désactivé", () => {
    const off = computeAvailability(world, { enabled: false, zones: new Set() });
    expect(text(redactor(world, off)("A Looted Mfg."))).toBe("A Looted Mfg.");
  });

  it("caviarde aussi dans les lignes d'emplacement", () => {
    const li = spotLine("Level 2 › Behind the Looted Mfg pile.", world, office);
    expect(li.querySelector("b")!.textContent).toBe("Level 2");
    expect(li.querySelector(".redacted")).toBeTruthy();
    expect(li.textContent).toBe("Level 2 » Behind the [REDACTED] pile.");
  });

  it("laisse en clair un nom disponible qui en contient un caché", () => {
    // sur les vraies données : « Chain » (à Manufacturing, caché) matchait à
    // l'intérieur d'« Exquisite Chain » (disponible via le coffre de Flathill),
    // donnant « Exquisite [REDACTED] » dans la fenêtre de l'item lui-même
    const real = new Model(dataset);
    const threeZones = computeAvailability(real, {
      enabled: true,
      zones: new Set(["Office Sector", "Flathill", "Far Garden"]),
    });
    expect(threeZones.item("exquisite_chain")).toBe(true);
    expect(threeZones.item("chain")).toBe(false);
    const out = text(redactor(real, threeZones)(
      "Exquisite Chain can be obtained through salvaging a Pocket Watch or Witch Skull."));
    expect(out).toBe("Exquisite Chain can be obtained through salvaging a "
      + 'Pocket Watch or <span class="redacted">[REDACTED]</span>.');
  });

  it("ne coupe pas un mot au milieu", () => {
    // « Uncharted Place » est une zone non découverte ; « Unchartedish » n'est
    // pas elle
    const redact = redactor(world, office);
    expect(text(redact("The Deepest part."))).toBe("The Deepest part.");
  });
});
