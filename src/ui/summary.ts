import type { Availability } from "../core/discovery";
import { chosenRecipe, type Model, type RecipeChoice } from "../core/tree";
import { computeTotals, type Totals } from "../core/totals";
import { BEYOND, groupByZone, type ZoneEntry } from "../core/zones";
import type { ItemId } from "../data/types";
import {
  badges, keyword, KIND_KEYWORD, originLines, sourceLines, sourceList,
  spoil, tile, veilName, veilTile, zoneTag,
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
  private readonly zones = document.getElementById("zones")!;

  constructor(
    private readonly model: Model,
    private readonly onHighlight: (id: ItemId) => void,
    private readonly onOpen: (id: ItemId) => void,
  ) {}

  private availability!: Availability;

  /** Posé par main.ts : la pastille d'un secteur ouvre sa fenêtre. */
  onZone?: (name: string, at?: MouseEvent) => void;

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
      veilName(this.availability, id, name);
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

      // juste « ×10 » : le découpage en stacks embrouillait plus qu'il
      // n'aidait ici — la taille de stack reste lisible dans la fenêtre d'item
      const count = document.createElement("span");
      count.className = "qtybig";
      count.textContent = `×${qty}`;

      const thumb = tile(this.model, item);
      veilTile(this.availability, id, thumb);
      row.append(thumb, label, count);
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
      veilName(this.availability, origin, link);
      head.appendChild(link);
      head.append(" :");
      block.appendChild(head);
      block.appendChild(this.sourceList(
        originLines(this.model, origin, sources, this.availability, this.onOpen),
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

  // ------------------------------------------------------------------ zones

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
      title.append(zoneTag(this.model, group.name, this.onZone), count);
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
    if (beyond) spoil(name);
    veilName(this.availability, entry.id, name);
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
      label.appendChild(this.sourceList(
        sourceLines(this.model, entry.sources, this.availability, this.onOpen)));
    }

    if (entry.via) {
      const how = document.createElement("div");
      how.className = "alt";
      how.append("then ", keyword(KIND_KEYWORD[entry.via.through.kind],
                                  entry.via.through.kind),
                 ` to get ${item.name}`);
      label.appendChild(how);
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

    const thumb = tile(this.model, item);
    veilTile(this.availability, entry.id, thumb);
    row.append(thumb, label, qty);
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

