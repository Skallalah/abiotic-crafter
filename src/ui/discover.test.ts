import { beforeEach, describe, expect, it } from "vitest";
import { DiscoverPanel, loadDiscovery } from "./discover";
import { discoveryDataset } from "../core/fixtures";
import { Model } from "../core/tree";
import type { DiscoveryState } from "../core/discovery";

const KEY = "gate-crafting-index/discovery";
const model = new Model(discoveryDataset());

function mount(): { panel: DiscoverPanel; button: HTMLButtonElement; changes: DiscoveryState[] } {
  document.body.innerHTML = `<button id="discover"></button>`;
  const button = document.getElementById("discover") as HTMLButtonElement;
  const changes: DiscoveryState[] = [];
  const panel = new DiscoverPanel(model, button, (state) => changes.push(state));
  panel.open();
  return { panel, button, changes };
}

const rows = () => [...document.querySelectorAll<HTMLButtonElement>(".discover-panel .dz")];
const row = (zone: string) => rows().find((r) => r.dataset.zone === zone);

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("état enregistré", () => {
  it("démarre au début du jeu quand rien n'est enregistré", () => {
    expect(loadDiscovery(model)).toEqual({
      enabled: true,
      zones: new Set(["Office Sector"]),
      spoilers: "hide",
    });
  });

  it("ignore les zones inconnues et le stockage illisible", () => {
    localStorage.setItem(KEY, JSON.stringify({
      enabled: true, zones: ["Office Sector", "Zone Disparue"],
    }));
    expect([...loadDiscovery(model).zones]).toEqual(["Office Sector"]);

    localStorage.setItem(KEY, "{pas du json");
    expect(loadDiscovery(model).zones.has("Office Sector")).toBe(true);
  });
});

describe("le panneau", () => {
  it("montre le découvert coché, la frontière floutée, et rien au-delà", () => {
    const { button } = mount();
    expect(button.textContent).toBe("Discovered Zones 1/5");
    expect(button.classList.contains("open")).toBe(true);   // panneau ouvert = enfoncé

    const office = row("Office Sector")!;
    expect(office.classList.contains("on")).toBe(true);
    expect(office.querySelector(".spoiler")).toBeNull();

    const mfg = row("Manufacturing West")!;
    expect(mfg.classList.contains("on")).toBe(false);
    expect(mfg.querySelector(".spoiler")).toBeTruthy();

    // The Deep n'est accessible que par Manufacturing : pas rendu du tout
    expect(row("The Deep")).toBeUndefined();
    // l'orpheline vit sous l'intertitre « Uncharted »
    expect(document.querySelector(".discover-title")!.textContent).toBe("Uncharted");
    expect(row("Uncharted Place")).toBeTruthy();
  });

  it("découvre au clic, persiste, et repousse la frontière", () => {
    const { changes, button } = mount();
    row("Manufacturing West")!.click();

    expect(changes).toHaveLength(1);
    expect(changes[0]!.zones.has("Manufacturing West")).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!).zones).toContain("Manufacturing West");
    expect(button.textContent).toBe("Discovered Zones 2/5");
    expect(row("The Deep")).toBeTruthy();          // la frontière a avancé
  });

  it("oublie une zone sans cascade : l'utilisateur reste maître", () => {
    mount();
    row("Manufacturing West")!.click();
    row("Office Sector")!.click();                 // dé-coche Office

    const state = loadDiscovery(model);
    expect(state.zones.has("Office Sector")).toBe(false);
    expect(state.zones.has("Manufacturing West")).toBe(true);
  });

  it("règle le sort des spoilers : Hide, Blur ou Show", () => {
    const { changes } = mount();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".spoiler-modes button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Hide", "Blur", "Show"]);
    expect(buttons[0]!.classList.contains("on")).toBe(true);   // défaut : Hide

    buttons[1]!.click();
    expect(changes[0]!.spoilers).toBe("blur");
    expect(JSON.parse(localStorage.getItem(KEY)!).spoilers).toBe("blur");
    expect(loadDiscovery(model).spoilers).toBe("blur");
  });

  it("retombe sur Hide devant un mode inconnu en stockage", () => {
    localStorage.setItem(KEY, JSON.stringify({
      enabled: true, zones: ["Office Sector"], spoilers: "sepia",
    }));
    expect(loadDiscovery(model).spoilers).toBe("hide");
  });

  it("l'interrupteur maître coupe tout le suivi", () => {
    const { changes } = mount();
    const master = document.querySelector<HTMLInputElement>(".discover-head input")!;
    master.checked = false;
    master.dispatchEvent(new Event("change"));

    expect(changes[0]!.enabled).toBe(false);
    expect(rows()).toHaveLength(0);                // plus rien à cocher
    expect(JSON.parse(localStorage.getItem(KEY)!).enabled).toBe(false);
  });
});
