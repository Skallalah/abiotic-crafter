import { planTotals, type PlanGoal } from "../core/plan";
import { craftOrder } from "../core/totals";
import { groupByZone, BEYOND } from "../core/zones";
import type { Availability } from "../core/discovery";
import type { Model, RecipeChoice } from "../core/tree";
import type { ItemId } from "../data/types";
import type { DetailsWindows } from "./details";
import { badges, itemLink, spoil, tile, veilName, veilTile, zoneTag } from "./format";

/** Distinct de la session : le plan survit aux changements d'objet courant. */
const KEY = "gate-crafting-index/plan";

/**
 * La fenêtre « Plan » (§5.8) : la liste de courses multi-objectifs.
 *
 * On épingle des crafts (×N), le plan somme leurs bilans entièrement dépliés
 * (`planTotals`) et les range par zone, cochables — la feuille de route d'une
 * session de jeu. La coche est PAR RESSOURCE, pas par zone : une ressource
 * est fongible, la ramasser à Office la raye aussi à Manufacturing.
 */
export class PlanWindow {
  private goals: PlanGoal[] = [];
  private done = new Set<ItemId>();

  constructor(
    private readonly model: Model,
    private readonly button: HTMLButtonElement,
    private readonly details: DetailsWindows,
    private readonly getChoice: () => RecipeChoice,
    private readonly getAvailability: () => Availability,
    private readonly onSelect: (id: ItemId) => void,
  ) {
    this.load();
    button.addEventListener("click", () => this.open());
    this.updateButton();
  }

  has(id: ItemId): boolean {
    return this.goals.some((goal) => goal.id === id);
  }

  /** Épingle un craft — un de plus s'il y est déjà. Ouvre la fenêtre. */
  add(id: ItemId): void {
    const goal = this.goals.find((g) => g.id === id);
    if (goal) goal.qty += 1;
    else this.goals.push({ id, qty: 1 });
    this.save();
    this.open();
  }

  open(): void {
    this.details.openPlan(() => this.view());
    this.refresh();
  }

  /** La découverte ou une recette a changé : re-rendre si la fenêtre est là. */
  refresh(): void {
    this.details.refreshWindow("plan");
    this.updateButton();
  }

  // ----------------------------------------------------------------- état

  private bump(id: ItemId, delta: number): void {
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) return;
    goal.qty += delta;
    if (goal.qty <= 0) this.goals = this.goals.filter((g) => g !== goal);
    this.save();
    this.refresh();
  }

  private remove(id: ItemId): void {
    this.goals = this.goals.filter((g) => g.id !== id);
    this.save();
    this.refresh();
  }

  private toggleDone(id: ItemId): void {
    if (this.done.has(id)) this.done.delete(id);
    else this.done.add(id);
    this.save();
    this.refresh();
  }

  private updateButton(): void {
    const n = this.goals.length;
    this.button.textContent = n > 0 ? `Plan ${n}` : "Plan";
    this.button.title = n > 0
      ? `${n} pinned craft${n > 1 ? "s" : ""} — the shopping list`
      : "Pin crafts and get a shopping list by zone";
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { goals?: unknown; done?: unknown };
      if (Array.isArray(parsed.goals)) {
        // un item disparu d'un re-scrape est ignoré, pas une erreur
        this.goals = parsed.goals
          .filter((g): g is [string, number] => Array.isArray(g)
            && typeof g[0] === "string" && typeof g[1] === "number"
            && g[1] > 0 && this.model.has(g[0]))
          .map(([id, qty]) => ({ id, qty: Math.floor(qty) }));
      }
      if (Array.isArray(parsed.done)) {
        this.done = new Set(parsed.done.filter(
          (id): id is string => typeof id === "string" && this.model.has(id),
        ));
      }
    } catch {
      // stockage illisible : on repart d'un plan vide
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        goals: this.goals.map((g) => [g.id, g.qty]),
        done: [...this.done],
      }));
    } catch {
      // stockage indisponible : le plan tient pour la session en cours
    }
  }

  // ---------------------------------------------------------------- rendu

  private view(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const availability = this.getAvailability();

    if (this.goals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "note plan-empty";
      empty.textContent = "Pin crafts here with the + button on tree cards, "
        + "or “+ Add to plan” in an item window.";
      fragment.appendChild(empty);
      return fragment;
    }

    fragment.appendChild(this.section(
      `Objectives — ${this.goals.length}`, this.goalRows(availability)));

    const totals = planTotals(this.model, this.goals, this.getChoice());
    // une ressource sortie du plan ne doit pas rester cochée en silence
    for (const id of [...this.done]) {
      if (!totals.base.has(id)) this.done.delete(id);
    }

    const list = document.createElement("div");
    for (const group of groupByZone(this.model, totals, availability)) {
      const block = document.createElement("div");
      block.className = "zone";
      const color = this.model.zone(group.name)?.color;
      if (color) block.style.setProperty("--zone", color);
      const title = document.createElement("h4");
      const count = document.createElement("small");
      count.textContent = `${group.entries.length} resource${group.entries.length > 1 ? "s" : ""}`;
      title.append(zoneTag(this.model, group.name), count);
      block.appendChild(title);
      for (const entry of group.entries) {
        if (entry.optional) continue;        // le plan liste le requis, pas le bonus
        block.appendChild(this.resourceRow(
          entry.id, totals.base.get(entry.id) ?? entry.qty,
          availability, group.name === BEYOND));
      }
      if (block.childElementCount > 1) list.appendChild(block);
    }

    const doneCount = [...totals.base.keys()]
      .filter((id) => this.done.has(id)).length;
    const head = document.createElement("div");
    head.className = "plan-head";
    const progress = document.createElement("span");
    progress.textContent = `${doneCount}/${totals.base.size} done`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "plan-reset";
    reset.textContent = "Reset";
    reset.title = "Uncheck everything";
    reset.addEventListener("click", () => {
      this.done.clear();
      this.save();
      this.refresh();
    });
    head.append(progress, reset);
    list.prepend(head);
    fragment.appendChild(this.section("Shopping list, by zone", list));

    const steps = document.createElement("ul");
    steps.className = "steps";
    for (const id of craftOrder(totals)) {
      const li = document.createElement("li");
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = `×${totals.steps.get(id)}`;
      const name = document.createElement("span");
      name.textContent = this.model.item(id).name;
      veilName(availability, id, name);
      li.append(n, name);
      steps.appendChild(li);
    }
    fragment.appendChild(this.section("Craft order", steps));

    return fragment;
  }

  private goalRows(availability: Availability): HTMLElement {
    const rows = document.createElement("div");
    rows.className = "rows plan-goals";
    for (const goal of this.goals) {
      const row = document.createElement("div");
      row.className = "row";
      // clic droit sur la ligne = fenêtre de détail, comme au bilan — sauf
      // sujet voilé, qui doit rester inerte
      if (availability.item(goal.id) || availability.spoilers !== "hide") {
        row.dataset.item = goal.id;
      }
      const thumb = tile(this.model, this.model.item(goal.id));
      veilTile(availability, goal.id, thumb);

      const label = document.createElement("span");
      const link = itemLink(this.model, goal.id, (id) => this.onSelect(id));
      veilName(availability, goal.id, link);
      label.append(link, " ", badges(this.model, goal.id));

      const controls = document.createElement("span");
      controls.className = "goal-controls";
      const qty = document.createElement("b");
      qty.textContent = `×${goal.qty}`;
      const button = (text: string, title: string, act: () => void) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = title;
        b.addEventListener("click", act);
        controls.appendChild(b);
      };
      button("−", "One less", () => this.bump(goal.id, -1));
      controls.appendChild(qty);
      button("+", "One more", () => this.bump(goal.id, +1));
      button("✕", "Remove from plan", () => this.remove(goal.id));

      row.append(thumb, label, controls);
      rows.appendChild(row);
    }
    return rows;
  }

  private resourceRow(id: ItemId, qty: number, availability: Availability,
                      beyond: boolean): HTMLElement {
    const item = this.model.item(id);
    const row = document.createElement("div");
    row.className = `row plan-row${this.done.has(id) ? " done" : ""}`;
    if (availability.item(id) || availability.spoilers !== "hide") {
      row.dataset.item = id;
    }

    const check = document.createElement("button");
    check.type = "button";
    check.className = "plan-check";
    check.textContent = this.done.has(id) ? "✓" : "";
    check.title = this.done.has(id) ? "Not gathered yet, actually" : "Gathered";
    check.addEventListener("click", () => this.toggleDone(id));

    const thumb = tile(this.model, item);
    veilTile(availability, id, thumb);

    const label = document.createElement("span");
    label.className = "plabel";
    const name = document.createElement("span");
    name.textContent = `${item.name} `;
    if (beyond) spoil(name);
    veilName(availability, id, name);
    label.append(name, badges(this.model, id));

    const amount = document.createElement("span");
    amount.className = `qtybig${this.done.has(id) ? " done" : ""}`;
    amount.textContent = `×${qty}`;

    row.append(check, thumb, label, amount);
    return row;
  }

  private section(title: string, content: HTMLElement): HTMLElement {
    const block = document.createElement("div");
    block.className = "details-section";
    const h = document.createElement("h4");
    h.textContent = title;
    block.append(h, content);
    return block;
  }
}
