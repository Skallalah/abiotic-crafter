import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DetailsWindows } from "./details";
import { computeAvailability } from "../core/discovery";
import { Model } from "../core/tree";
import { discoveryDataset, mockupDataset } from "../core/fixtures";

const model = new Model(mockupDataset());
const everything = computeAvailability(model, { enabled: false, zones: new Set() });

const instances: DetailsWindows[] = [];

afterEach(() => {
  for (const w of instances) w.dispose();
  instances.length = 0;
});

function mount(): { windows: DetailsWindows; selected: string[] } {
  document.body.innerHTML = `<div class="row" data-item="circuit_board">Circuit Board</div>`;
  const selected: string[] = [];
  const windows = new DetailsWindows(model, (id) => selected.push(id), "https://wiki/",
                                     everything);
  instances.push(windows);
  return { windows, selected };
}

const boxes = () => [...document.querySelectorAll<HTMLElement>(".winbox")];
const anchorEl = () => document.querySelector("[data-item]")!;

function rightClick(el: Element, x = 0, y = 0): MouseEvent {
  const event = new window.MouseEvent("contextmenu",
    { bubbles: true, cancelable: true, clientX: x, clientY: y });
  el.dispatchEvent(event);
  return event;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("fiche d'un provider", () => {
  it("liste les propriétés de l'infobox {{enemy}} façon wiki, une par ligne", () => {
    // même traitement que la fenêtre d'item : dl.props, étiquette + valeur
    document.body.innerHTML = `<div data-provider="security_bot"></div>`;
    const windows = new DetailsWindows(model, () => {}, "https://wiki/", everything);
    instances.push(windows);
    rightClick(document.querySelector("[data-provider]")!);
    const dl = document.querySelector(".winbox dl.props")!;
    const rows = [...dl.querySelectorAll("dt")].map((dt) =>
      [dt.textContent, dt.nextElementSibling!.textContent]);
    expect(rows).toEqual([
      ["Type", "Robot"],
      ["Codename", "GATE-01"],
      ["Origin", "Anteverse 2"],
      ["Melee", "50 — Blunt"],
      ["Weakness", "Electricity"],
      ["Immunity", "Poison"],
    ]);
  });

  it("détaille la santé dans son propre bloc, une ligne par partie", () => {
    document.body.innerHTML = `<div data-provider="security_bot"></div>`;
    const windows = new DetailsWindows(model, () => {}, "https://wiki/", everything);
    instances.push(windows);
    rightClick(document.querySelector("[data-provider]")!);
    const rows = [...document.querySelectorAll(".winbox .health .hp")];
    // la fixture n'a que torse et jambes : tête et bras n'ont pas de ligne
    expect(rows.map((r) => r.textContent)).toEqual(["Torso80", "Legs10"]);
    for (const row of rows) {
      expect(row.querySelector("svg path")!.getAttribute("fill")).toBe("currentColor");
    }
  });

  it("se contente de la nature quand la page n'a pas d'infobox", () => {
    document.body.innerHTML = `<div data-provider="computer"></div>`;
    const windows = new DetailsWindows(model, () => {}, "https://wiki/", everything);
    instances.push(windows);
    rightClick(document.querySelector("[data-provider]")!);
    const rows = [...document.querySelectorAll(".winbox dl.props dt")]
      .map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]);
    expect(rows).toEqual([["Type", "Destroyable object — break it"]]);
  });
});

describe("clic droit", () => {
  it("ouvre une fenêtre sur l'item et retient le menu du navigateur", () => {
    mount();
    const event = rightClick(anchorEl());
    expect(event.defaultPrevented).toBe(true);
    expect(boxes()).toHaveLength(1);
    expect(boxes()[0]!.textContent).toContain("Circuit Board");
  });

  it("laisse le menu du navigateur partout ailleurs", () => {
    mount();
    expect(rightClick(document.body).defaultPrevented).toBe(false);
    expect(boxes()).toHaveLength(0);
  });

  it("pose la fenêtre là où on a cliqué", () => {
    mount();
    rightClick(anchorEl(), 300, 220);
    const box = boxes()[0]!;
    expect(parseInt(box.style.left, 10)).toBe(312);
    expect(parseInt(box.style.top, 10)).toBe(200);
  });
});

describe("fenêtre d'un contenant", () => {
  it("montre son contenu, sa zone et ses emplacements", () => {
    mount();
    rightClick(anchorEl());
    // le lien que sourceLine pose sur « break Computer »
    const link = boxes()[0]!.querySelector<HTMLButtonElement>("button[data-provider]")!;
    expect(link.textContent).toBe("Computer");

    link.click();
    const crate = boxes()[1]!;
    expect(crate.textContent).toContain("Destroyable object");
    expect(crate.textContent).toContain("Case Fan");
    expect(crate.textContent).toContain("50%");

    // chaque emplacement est rangé sous sa zone, et une zone sans emplacement
    // connu reste visible
    const zones = [...crate.querySelectorAll(".zoneblock")];
    expect(zones.map((z) => z.querySelector(".zonetag")!.textContent))
      .toEqual(["Office Sector", "Manufacturing West"]);
    expect(zones[0]!.querySelector(".spots")!.textContent).toContain("Data Farm");
    expect(zones[1]!.querySelector(".spots")).toBeNull();
  });

  it("sélectionne l'item cliqué sans refermer la fenêtre", () => {
    const { selected } = mount();
    rightClick(anchorEl());
    boxes()[0]!.querySelector<HTMLButtonElement>("button[data-provider]")!.click();

    // le contenu est trié par chance décroissante : Circuit Board (100 %) d'abord
    const first = boxes()[1]!.querySelector<HTMLButtonElement>(".rows button.link")!;
    expect(first.textContent).toBe("Circuit Board");
    first.click();
    expect(selected).toEqual(["circuit_board"]);
    expect(boxes()).toHaveLength(2);
  });
});

describe("plusieurs fenêtres", () => {
  it("cohabitent, une par sujet", () => {
    mount();
    rightClick(anchorEl());
    boxes()[0]!.querySelector<HTMLButtonElement>("button[data-provider]")!.click();
    expect(boxes()).toHaveLength(2);

    // rouvrir le même sujet le ramène devant plutôt que d'empiler un doublon
    rightClick(anchorEl());
    expect(boxes()).toHaveLength(2);
  });

  it("se referment une à une par leur ✕", () => {
    mount();
    rightClick(anchorEl());
    boxes()[0]!.querySelector<HTMLElement>(".wb-close")!.click();
    expect(boxes()).toHaveLength(0);

    // et le sujet refermé peut être rouvert
    rightClick(anchorEl());
    expect(boxes()).toHaveLength(1);
  });
});

describe("enrouler", () => {
  it("réduit la fenêtre à sa barre de titre au double-clic, et la rouvre", () => {
    mount();
    rightClick(anchorEl(), 300, 220);
    const box = boxes()[0]!;
    const header = box.querySelector(".wb-header")!;

    header.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    expect(box.classList.contains("shaded")).toBe(true);
    // elle ne bouge pas : c'est ce qui la distingue d'un minimize
    expect(box.style.left).toBe("312px");

    header.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
    expect(box.classList.contains("shaded")).toBe(false);
  });
});

describe("fenêtre d'un item", () => {
  it("liste sa recette, ce qui la consomme, et sélectionne à la demande", () => {
    const { selected } = mount();
    rightClick(anchorEl());
    const box = boxes()[0]!;

    expect(box.textContent).toContain("Recipe");
    expect(box.textContent).toContain("Tech Scrap");
    expect(box.textContent).toContain("Used in");

    const observe = [...box.querySelectorAll("button")]
      .find((b) => b.textContent === "Observe this item")!;
    observe.click();
    expect(selected).toEqual(["circuit_board"]);
  });
});


describe("découverte dans les fenêtres", () => {
  const world = new Model(discoveryDataset());
  const state = (...zones: string[]) => ({ enabled: true, zones: new Set(zones) });

  function mountWorld(spoilers: "hide" | "blur" | "show" = "blur") {
    document.body.innerHTML = `<div data-item="looted_mfg"></div>`;
    const windows = new DetailsWindows(world, () => {}, "https://wiki/",
      computeAvailability(world, { ...state("Office Sector"), spoilers }));
    instances.push(windows);
    return windows;
  }

  it("tait les zones non découvertes, mais en donne le compte", () => {
    mountWorld();
    rightClick(document.querySelector("[data-item]")!);
    const box = boxes()[0]!;
    expect(box.textContent).not.toContain("Manufacturing West");
    expect(box.textContent).toContain("+ 1 zone not yet discovered");
  });

  it("re-rend les fenêtres ouvertes quand la découverte change", () => {
    const windows = mountWorld();
    rightClick(document.querySelector("[data-item]")!);
    windows.setAvailability(computeAvailability(world,
      { ...state("Office Sector", "Manufacturing West"), spoilers: "blur" }));
    const box = boxes()[0]!;
    expect(box.textContent).toContain("Manufacturing West");
    expect(box.textContent).not.toContain("not yet discovered");
  });

  it("floute un lien vers un contenant hors zones (mode Blur)", () => {
    document.body.innerHTML = `<div data-item="via_crate"></div>`;
    instances.push(new DetailsWindows(world, () => {}, "https://wiki/",
      computeAvailability(world, { ...state("Office Sector"), spoilers: "blur" })));
    rightClick(document.querySelector("[data-item]")!);
    const link = boxes()[0]!.querySelector("[data-provider]")!;
    expect(link.classList.contains("spoiler")).toBe(true);
  });

  it("mode Hide : caché, c'est caché", () => {
    // la fenêtre d'un item voilé ne s'ouvre pas — elle le révélerait
    mountWorld("hide");
    const event = rightClick(document.querySelector("[data-item]")!);
    expect(event.defaultPrevented).toBe(false);
    expect(boxes()).toHaveLength(0);

    // et dans la fenêtre d'un item atteignable, le lien de contenant voilé
    // devient un [REDACTED] inerte, sans data-provider
    document.body.innerHTML = `<div data-item="office_tracker"></div>`;
    instances.push(new DetailsWindows(world, () => {}, "https://wiki/",
      computeAvailability(world, { ...state("Office Sector"), spoilers: "hide" })));
    rightClick(document.querySelector("[data-item]")!);
    const box = boxes()[0]!;
    const censored = box.querySelector<HTMLButtonElement>("button.censored")!;
    expect(censored.textContent).toBe("[REDACTED]");
    expect(censored.disabled).toBe(true);
    expect(censored.dataset.provider).toBeUndefined();
  });

  it("mode Hide : une ligne [REDACTED] tait aussi son contexte", () => {
    // la condition « Completing Canaan… » nommerait ce qu'on vient de taire
    document.body.innerHTML = `<div data-provider="mfg_crate"></div>`;
    instances.push(new DetailsWindows(world, () => {}, "https://wiki/",
      computeAvailability(world,
        { ...state("Office Sector", "Manufacturing West"), spoilers: "hide" })));
    document.querySelector<HTMLElement>("[data-provider]")!
      .dispatchEvent(new window.MouseEvent("contextmenu",
        { bubbles: true, cancelable: true }));
    const box = boxes()[0]!;
    expect(box.textContent).not.toContain("Completing");
    const row = box.querySelector(".censored")!.closest(".row")!;
    expect(row.querySelector(".stack")!.textContent).toBe("");
  });
});
