import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DetailsWindows } from "./details";
import { PlanWindow } from "./plan";
import { computeAvailability } from "../core/discovery";
import { Model, type RecipeChoice } from "../core/tree";
import { mockupDataset } from "../core/fixtures";

const model = new Model(mockupDataset("loot"));
const everything = computeAvailability(model, { enabled: false, zones: new Set() });
const NO_CHOICE: RecipeChoice = new Map();

const instances: DetailsWindows[] = [];
afterEach(() => {
  for (const d of instances) d.dispose();
  instances.length = 0;
});

function mount(availability = everything): PlanWindow {
  document.body.innerHTML = `<button id="plan" type="button"></button>`;
  const details = new DetailsWindows(model, () => {}, "https://wiki/", availability);
  instances.push(details);
  return new PlanWindow(
    model,
    document.getElementById("plan") as HTMLButtonElement,
    details,
    () => NO_CHOICE,
    () => availability,
    () => {},
  );
}

const button = () => document.getElementById("plan")!;
const win = () => document.querySelector<HTMLElement>(".winbox");
const rows = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("le plan de courses", () => {
  it("épingle, cumule, et affiche le compte sur le bouton", () => {
    const plan = mount();
    expect(button().textContent).toBe("Plan");
    plan.add("glowstick");
    expect(button().textContent).toBe("Plan 1");
    expect(win()).toBeTruthy();
    plan.add("glowstick");
    // deux fois le même craft = un objectif ×2, pas deux lignes
    expect(button().textContent).toBe("Plan 1");
    const goal = rows(".plan-goals .row")[0]!;
    expect(goal.textContent).toContain("Glowstick");
    expect(goal.querySelector(".goal-controls b")!.textContent).toBe("×2");
  });

  it("liste les ressources par zone, cochables globalement", () => {
    const plan = mount();
    plan.add("glowstick");
    // glowstick ← test_tube + bio_scrap, tous deux à Office Sector
    const zone = rows(".winbox .zone").find((z) =>
      z.textContent!.includes("Office Sector"))!;
    expect(zone.textContent).toContain("Test Tube");
    const check = zone.querySelector<HTMLButtonElement>(".plan-check")!;
    check.click();
    const done = rows(".winbox .plan-row.done");
    expect(done.length).toBeGreaterThan(0);
    expect(done[0]!.querySelector(".qtybig.done")).toBeTruthy();
    expect(document.querySelector(".plan-head")!.textContent).toContain("1/");
  });

  it("Reset décoche tout, ✕ retire l'objectif", () => {
    const plan = mount();
    plan.add("box_of_screws");
    document.querySelector<HTMLButtonElement>(".winbox .plan-check")!.click();
    // Metal Scrap est trouvable dans DEUX zones : la coche globale le barre
    // dans les deux — une ressource est fongible entre zones
    const done = rows(".plan-row.done");
    expect(done.length).toBe(2);
    expect(done.every((r) => r.textContent!.includes("Metal Scrap"))).toBe(true);
    document.querySelector<HTMLButtonElement>(".plan-reset")!.click();
    expect(rows(".plan-row.done").length).toBe(0);

    document.querySelector<HTMLButtonElement>(
      '.goal-controls button[title="Remove from plan"]')!.click();
    expect(button().textContent).toBe("Plan");
    expect(document.querySelector(".plan-empty")).toBeTruthy();
  });

  it("persiste objectifs et coches, et filtre les items disparus", () => {
    const plan = mount();
    plan.add("glowstick");
    plan.add("glowstick");
    document.querySelector<HTMLButtonElement>(".winbox .plan-check")!.click();

    // un plan enregistré avec un item d'un ancien scrape
    const saved = JSON.parse(localStorage.getItem("gate-crafting-index/plan")!);
    saved.goals.push(["item_disparu", 3]);
    saved.done.push("autre_disparu");
    localStorage.setItem("gate-crafting-index/plan", JSON.stringify(saved));

    for (const d of instances) d.dispose();
    instances.length = 0;
    const again = mount();
    expect(button().textContent).toBe("Plan 1");
    again.open();
    expect(rows(".plan-goals .row").length).toBe(1);
    expect(rows(".goal-controls b")[0]!.textContent).toBe("×2");
    expect(rows(".plan-row.done").length).toBe(1);
  });

  it("clic droit sur une ligne du plan : la fenêtre de détail s'ouvre", () => {
    const plan = mount();
    plan.add("glowstick");
    const row = document.querySelector<HTMLElement>(".winbox .plan-row")!;
    expect(row.dataset.item).toBeTruthy();
    row.dispatchEvent(new window.MouseEvent("contextmenu",
      { bubbles: true, cancelable: true }));
    const titles = [...document.querySelectorAll(".winbox .wb-title")]
      .map((t) => t.textContent);
    expect(titles).toContain("Test Tube");
  });

  it("la pastille de zone du plan ouvre la fenêtre du secteur", () => {
    const plan = mount();
    plan.add("glowstick");
    document.querySelector<HTMLButtonElement>(".winbox .zone button.zonetag")!.click();
    const sector = [...document.querySelectorAll(".winbox")]
      .find((w) => w.textContent!.includes("Somewhere in the zone"));
    expect(sector).toBeTruthy();
  });

  it("voile un objectif hors de portée — le plan n'est pas une fuite", () => {
    const nothing = computeAvailability(model,
      { enabled: true, zones: new Set(), spoilers: "hide" });
    const plan = mount(nothing);
    plan.add("glowstick");
    const goal = rows(".plan-goals .row")[0]!;
    expect(goal.querySelector(".censored")).toBeTruthy();
    expect(goal.textContent).not.toContain("Glowstick");
    // et la ligne voilée reste inerte au clic droit
    expect(goal.dataset.item).toBeUndefined();
  });
});
