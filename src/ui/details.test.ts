import { beforeEach, describe, expect, it } from "vitest";
import { DetailsWindows } from "./details";
import { Model } from "../core/tree";
import { mockupDataset } from "../core/fixtures";

const model = new Model(mockupDataset());

function mount(): { windows: DetailsWindows; selected: string[] } {
  document.body.innerHTML = `<div class="row" data-item="circuit_board">Circuit Board</div>`;
  const selected: string[] = [];
  const windows = new DetailsWindows(model, (id) => selected.push(id), "https://wiki/");
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
    expect(crate.textContent).toContain("Data Farm");
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
