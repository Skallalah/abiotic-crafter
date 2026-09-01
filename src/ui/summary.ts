import type { Availability } from "../core/discovery";
import { chosenRecipe, type Model, type RecipeChoice } from "../core/tree";
import { computeTotals, craftOrder, type Totals } from "../core/totals";
import { BEYOND, groupByZone, type ZoneEntry } from "../core/zones";
import type { ItemId, Source } from "../data/types";
import {
  badges, keyword, KIND_KEYWORD, MAX_SPOTS, originLines, sourceLine, sourceList,
  spoil, spotLine, stackText, tile, zoneTag,
} from "./format";

/**
 * Colonne de droite (§5.4).
 *
 * Le bilan suit le dépli de l'arbre : un nœud replié est compté comme un objet
 * à se procurer entier, avec ses moyens de l'obtenir. C'est un renversement
 * assumé du critère §8 (« exploser ou replier ne change jamais le bilan »),
 * demandé pour pouvoir dire « celui-là, je le prends tel quel ».
 */
export class Summary {
  private readonly baseRows = document.getElementById("baseRows")!;
  private readonly baseCount = document.getElementById("baseCount")!;
  private readonly steps = document.getElementById("steps")!;
  private readonly zones = document.getElementById("zones")!;

  constructor(
    private readonly model: Model,
    private readonly onHighlight: (id: ItemId) => void,
    private readonly onOpen: (id: ItemId) => void,
  ) {}

  private availability!: Availability;

  render(
    root: ItemId,
    choice: RecipeChoice,
    highlighted: ItemId | null,
    expanded: ReadonlySet<string>,
    availability: Availability,
  ): Totals {
    this.availability = availability;
    const totals = computeTotals(this.model, root, choice, 1, expanded);
    this.renderBase(totals, highlighted);
    this.renderSteps(totals, choice, highlighted);
    this.renderZones(totals, choice, highlighted);
    return totals;
  }

  // ---------------------------------------------------------------- 1. base

  private renderBase(totals: Totals, highlighted: ItemId | null): void {
    const ids = [...totals.base.keys()].sort(
      (a, b) => totals.base.get(b)! - totals.base.get(a)!,
    );
    const fragment = document.createDocumentFragment();

    for (const id of ids) {
      const item = this.model.item(id);
      const qty = totals.base.get(id)!;
      const row = this.row(id, highlighted);

      const label = document.createElement("span");
      const name = document.createElement("span");
      name.textContent = `${item.name} `;
      if (!this.availability.item(id)) spoil(name);
      label.append(name, badges(this.model, id));
      const craft = this.craftLine(id);
      if (craft) label.appendChild(craft);
      for (const line of this.collectLines(id)) label.appendChild(line);
      if (this.model.isDual(id)) {
        const alt = document.createElement("div");
        alt.className = "alt";
        alt.textContent = this.craftAlternative(id, qty);
        label.appendChild(alt);
      }

      const stack = document.createElement("span");
      stack.className = "stack";
      const big = document.createElement("span");
      big.className = "qtybig";
      big.textContent = String(qty);
      stack.append(big, ` ${stackText(item, qty)}`);

      row.append(tile(this.model, item), label, stack);
      fragment.appendChild(row);
    }

    this.baseRows.replaceChildren(fragment);
    const units = [...totals.base.values()].reduce((a, b) => a + b, 0);
    this.baseCount.textContent = `— ${ids.length} types, ${units} units`;
  }

  /**
   * « à fabriquer : Crafting Bench, 3 composants ».
   *
   * Un craftable replié arrive dans les ressources de base : sans cette ligne
   * il s'y afficherait comme s'il se ramassait, alors que le moyen de l'obtenir
   * est justement de le fabriquer.
   */
  private craftLine(id: ItemId): HTMLElement | null {
    // Seulement pour un craftable arrivé ici parce qu'il est replié. Un dual
    // `primary: loot` est une feuille légitime : sa recette est déjà présentée
    // par la ligne « ou craft », inutile de la contredire avec « à fabriquer ».
    if (!this.model.isCraftable(id) || this.model.isLeaf(id)) return null;
    const recipe = chosenRecipe(this.model, id, new Map());
    if (!recipe) return null;
    const n = recipe.inputs.length;
    const line = document.createElement("div");
    line.className = "alt";
    line.append(keyword("craft", "craft"),
                ` at ${recipe.bench}, ${n} component${n > 1 ? "s" : ""}` +
                " — expand the node to break it down");
    return line;
  }

  /**
   * « à ramasser : Fire Extinguisher — Manufacturing West ».
   *
   * Sans ça, un objet purement dérivé n'affiche que « démonter Fire
   * Extinguisher » et cache le lieu de spawn : la liste dit quoi démonter mais
   * pas où le chercher.
   */
  private collectLines(id: ItemId): HTMLElement[] {
    if (!this.model.isDerived(id)) return [];
    return this.model.collectibles(id).map(({ origin, sources }) => {
      const block = document.createElement("div");
      block.className = "alt collect";
      const head = document.createElement("div");
      head.append("collect ");
      const link = this.openLink(origin);
      if (!this.availability.item(origin)) spoil(link);
      head.appendChild(link);
      head.append(" :");
      block.appendChild(head);
      block.appendChild(this.sourceList(
        originLines(this.model, origin, sources, this.availability),
      ));
      return block;
    });
  }

  /** Nom de l'objet, cliquable pour l'ouvrir comme nouvelle racine. */
  private openLink(id: ItemId): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "open";
    button.textContent = this.model.item(id).name;
    button.title = `Open ${this.model.item(id).name}`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onOpen(id);
    });
    return button;
  }

  /** « ou craft : 80 Tech Scrap (8 chacun) » pour un dual `primary: loot`. */
  private craftAlternative(id: ItemId, qty: number): string {
    const recipe = chosenRecipe(this.model, id, new Map());
    if (!recipe) return "";
    const perCraft = Math.max(1, recipe.output.qty);
    const crafts = Math.ceil(qty / perCraft);
    const parts = recipe.inputs.map(
      (input) => `${input.qty * crafts} ${this.model.item(input.item).name} (${input.qty} each)`,
    );
    return `or craft: ${parts.join(", ")}`;
  }

  // --------------------------------------------------------------- 2. étapes

  private renderSteps(totals: Totals, choice: RecipeChoice, highlighted: ItemId | null): void {
    const fragment = document.createDocumentFragment();

    for (const id of craftOrder(totals)) {
      const item = this.model.item(id);
      const qty = totals.steps.get(id)!;
      const li = document.createElement("li");
      li.dataset.item = id;
      if (highlighted === id) li.classList.add("hl");

      const n = document.createElement("span");
      n.className = "n";
      n.textContent = `×${qty}`;

      const label = document.createElement("span");
      const name = document.createElement("span");
      name.textContent = `${item.name} `;
      if (!this.availability.item(id)) spoil(name);
      label.append(name, badges(this.model, id));
      if (this.model.isDual(id)) {
        const alt = document.createElement("div");
        alt.className = "alt";
        alt.textContent = "or loot :";
        alt.appendChild(this.sourceList(this.lootLines(id)));
        label.appendChild(alt);
      }

      const bench = document.createElement("span");
      bench.className = "b";
      bench.textContent = chosenRecipe(this.model, id, choice)?.bench ?? "";

      li.append(n, label, bench);
      li.addEventListener("click", () => this.onHighlight(id));
      fragment.appendChild(li);
    }

    this.steps.replaceChildren(fragment);
  }

  /**
   * « ou loot : Office Sector — casser Computer ». Les sources localisées
   * passent devant : savoir dans quel secteur ramasser l'objet est plus utile
   * que la liste des objets à démonter pour l'obtenir.
   */
  private lootLines(id: ItemId): HTMLLIElement[] {
    const sources = [...this.model.item(id).sources]
      .filter((s) => this.availability.source(s))
      .sort((a, b) => rankSource(a) - rankSource(b));
    if (sources.length === 0) {
      const li = document.createElement("li");
      li.textContent = "in undiscovered zones";
      return [li];
    }
    return sources.map((source) => {
      const li = sourceLine(this.model, source, this.availability);
      if (source.zone) {
        const zone = document.createElement("b");
        zone.textContent = source.zone;
        li.prepend(zone, " — ");
      }
      return li;
    });
  }

  // ---------------------------------------------------------------- 3. zones

  private renderZones(totals: Totals, choice: RecipeChoice, highlighted: ItemId | null): void {
    const fragment = document.createDocumentFragment();

    for (const group of groupByZone(this.model, totals, this.availability)) {
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
        block.appendChild(this.zoneRow(entry, choice, highlighted, group.name === BEYOND));
      }
      fragment.appendChild(block);
    }

    this.zones.replaceChildren(fragment);
  }

  private zoneRow(entry: ZoneEntry, choice: RecipeChoice, highlighted: ItemId | null,
                  beyond = false): HTMLElement {
    const item = this.model.item(entry.id);
    const row = this.row(entry.id, highlighted);
    if (entry.optional) row.classList.add("optional");

    const label = document.createElement("span");
    const name = document.createElement("span");
    name.textContent = `${item.name} `;
    // dans « Beyond known zones », même le nom est un spoiler
    if (beyond || !this.availability.item(entry.id)) spoil(name);
    label.append(name, badges(this.model, entry.id));

    if (entry.via) {
      // c'est l'origine qu'on ramasse ici, pas l'objet dérivé
      const head = document.createElement("div");
      head.className = "targets";
      head.append("collect ");
      head.appendChild(this.openLink(entry.via.origin));
      head.append(" :");
      label.appendChild(head);
    }
    if (entry.sources.length > 0) {
      label.appendChild(
        this.sourceList(entry.sources.map((s) => sourceLine(this.model, s, this.availability))),
      );
    }

    if (entry.via) {
      const how = document.createElement("div");
      how.className = "alt";
      how.append("then ", keyword(KIND_KEYWORD[entry.via.through.kind],
                                  entry.via.through.kind),
                 ` to get ${item.name}`);
      label.appendChild(how);
    }

    // Les emplacements précis : le wiki en liste jusqu'à sept par zone, qui
    // formaient jusqu'ici un pavé de texte noyant les lignes d'obtention.
    const spots = entry.sources.flatMap((s) => s.where ?? []);
    if (spots.length > 0) {
      label.appendChild(this.sourceList(unique(spots).map(spotLine), MAX_SPOTS, "spots"));
    }

    if (entry.optional) {
      const note = document.createElement("div");
      note.className = "alt";
      note.textContent = `optional: saves crafting ${this.avoided(entry.id, entry.qty, choice)}`;
      label.appendChild(note);
    }

    const qty = document.createElement("span");
    qty.className = `qtybig${entry.optional ? " done" : ""}`;
    qty.textContent = String(entry.qty);

    row.append(tile(this.model, item), label, qty);
    return row;
  }

  private avoided(id: ItemId, qty: number, choice: RecipeChoice): string {
    const recipe = chosenRecipe(this.model, id, choice);
    if (!recipe) return "";
    const crafts = Math.ceil(qty / Math.max(1, recipe.output.qty));
    return recipe.inputs
      .map((input) => `${input.qty * crafts} ${this.model.item(input.item).name}`)
      .join(", ");
  }

  // ------------------------------------------------------------------ commun

  /** Alias local : le composant vit dans format.ts, partagé avec les fenêtres. */
  private sourceList(lines: HTMLLIElement[], max?: number, className?: string) {
    return sourceList(lines, max, className);
  }

  private row(id: ItemId, highlighted: ItemId | null): HTMLElement {
    const row = document.createElement("div");
    row.className = `row${highlighted === id ? " hl" : ""}`;
    row.dataset.item = id;                 // cible du clic droit
    row.addEventListener("click", () => this.onHighlight(id));
    return row;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Une source localisée passe avant une source globale, le salvage en dernier. */
function rankSource(source: Source): number {
  if (source.zone) return 0;
  return source.kind === "salvage" ? 2 : 1;
}
