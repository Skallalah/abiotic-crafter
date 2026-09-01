import type { Availability } from "../core/discovery";
import { buildTree, type Model, type RecipeChoice, type TreeNode } from "../core/tree";
import type { ItemId } from "../data/types";
import { badges, spoil, tile } from "./format";

export interface TreeCallbacks {
  toggle: (path: string) => void;
  highlight: (id: ItemId) => void;
  swapRecipe: (id: ItemId) => void;
  /** Ouvrir un objet comme nouvelle racine, depuis le bouton ↗ d'une carte. */
  open: (id: ItemId) => void;
  /** Un lien montant a été suivi : l'objet cliqué devient la nouvelle racine. */
  openParent: (id: ItemId) => void;
}

/**
 * Nombre de liens montants affichés au-dessus de la racine.
 *
 * 89 % des items sont consommés par 12 crafts ou moins ; au-delà (Metal Scrap
 * en compte 51) une rangée complète ferait 9 000 px de large et écraserait le
 * zoom de « Recentrer ». Le surplus est annoncé par un compteur.
 */
const MAX_PARENTS = 12;

export interface TreeState {
  root: ItemId;
  expanded: ReadonlySet<string>;
  choice: RecipeChoice;
  highlighted: ItemId | null;
  availability: Availability;
}

/** Colonne centrale : l'arbre explosable (§5.3). */
export class TreeView {
  constructor(
    private readonly model: Model,
    private readonly stage: HTMLElement,
    private readonly callbacks: TreeCallbacks,
  ) {}

  render(state: TreeState): void {
    // On construit l'arbre complet, alternatives comprises, et on ne rend que
    // ce qui est déplié : le bilan, lui, ne regarde jamais `expanded`.
    const tree = buildTree(this.model, state.root, state.choice, { expandLeafRecipes: true });
    const ul = document.createElement("ul");
    ul.className = "tree";
    ul.appendChild(this.branch(tree, state, true));

    const scene = document.createElement("div");
    scene.className = "scene";
    const parents = this.parents(state.root, state.availability);
    if (parents) scene.appendChild(parents);
    scene.appendChild(ul);
    this.stage.replaceChildren(scene);
  }

  /**
   * Bloc des liens montants, au-dessus de la racine : les crafts qui
   * consomment l'objet courant, reliés par des pointillés teal. Cliquer sur
   * l'un d'eux en fait la nouvelle racine, comme un clic dans la liste.
   */
  private parents(root: ItemId, availability: Availability): HTMLElement | null {
    const all = this.model.usedIn(root);
    if (all.length === 0) return null;

    const block = document.createElement("div");
    block.className = "parents";

    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = all.length === 1
      ? "used in 1 craft — click to go there"
      : `used in ${all.length} crafts — click to go there`;
    block.appendChild(caption);

    const row = document.createElement("ul");
    for (const parent of all.slice(0, MAX_PARENTS)) {
      const li = document.createElement("li");
      li.appendChild(this.parentCard(parent.item, parent.qty, availability));
      row.appendChild(li);
    }
    if (all.length > MAX_PARENTS) {
      const li = document.createElement("li");
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+ ${all.length - MAX_PARENTS} more`;
      more.title = "Use the search on the left to open those";
      li.appendChild(more);
      row.appendChild(li);
    }
    block.appendChild(row);

    const drop = document.createElement("div");
    drop.className = "drop";
    block.appendChild(drop);
    return block;
  }

  private parentCard(id: ItemId, qty: number, availability: Availability): HTMLElement {
    const item = this.model.item(id);
    const el = document.createElement("div");
    // format compact vertical des feuilles : une rangée de 12 cartes
    // horizontales ferait 2 900 px et « Recentrer » écraserait l'arbre.
    el.className = "node base parent";
    el.dataset.item = id;
    el.tabIndex = 0;
    el.title = `${item.name} — click to see its tree`;

    const text = document.createElement("span");
    const name = document.createElement("div");
    name.className = "name";
    name.append(`${item.name} `, badges(this.model, id));
    if (!availability.item(id)) spoil(name);
    text.append(name);

    // quantité de l'objet courant que cette recette consomme
    const consumed = document.createElement("span");
    consumed.className = "qty";
    consumed.textContent = `×${qty}`;

    el.append(tile(this.model, item), text, consumed);
    const open = (event: Event) => {
      event.stopPropagation();
      this.callbacks.openParent(id);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    });
    return el;
  }

  /** Tous les chemins explosables sous la racine, voie principale seulement (§5.3). */
  expandablePaths(state: TreeState): string[] {
    const tree = buildTree(this.model, state.root, state.choice);
    const out: string[] = [];
    (function walk(node: TreeNode) {
      if (node.recipe && !node.loop) {
        out.push(node.path);
        node.children.forEach(walk);
      }
    })(tree);
    return out;
  }

  private branch(node: TreeNode, state: TreeState, isRoot: boolean): HTMLLIElement {
    const li = document.createElement("li");
    const open = node.recipe !== undefined && state.expanded.has(node.path);

    if (!open) {
      li.appendChild(this.card(node, state, isRoot));
      return li;
    }

    const box = document.createElement("div");
    box.className = "exploded";
    box.appendChild(this.card(node, state, isRoot));

    const bench = document.createElement("div");
    bench.className = "bench";
    bench.textContent = node.alternative
      ? `alternative recipe — ${node.recipe!.bench}`
      : node.recipe!.bench;
    box.appendChild(bench);

    if (node.recipe!.unlock) {
      const unlock = document.createElement("div");
      unlock.className = "bench unlock";
      unlock.textContent = node.recipe!.unlock;
      box.appendChild(unlock);
    }

    const children = document.createElement("ul");
    for (const child of node.children) children.appendChild(this.branch(child, state, false));
    box.appendChild(children);

    li.appendChild(box);
    return li;
  }

  private card(node: TreeNode, state: TreeState, isRoot: boolean): HTMLElement {
    const item = this.model.item(node.id);
    const explodable = node.recipe !== undefined && !node.loop;
    const leaf = this.model.isLeaf(node.id);

    const el = document.createElement("div");
    el.className = [
      "node",
      explodable ? "craftable" : "",
      leaf ? "base" : "",
      isRoot ? "root" : "",
      node.loop ? "loop" : "",
      state.highlighted === node.id ? "hl" : "",
    ].filter(Boolean).join(" ");
    el.dataset.item = node.id;

    const text = document.createElement("span");
    const name = document.createElement("div");
    name.className = "name";
    name.append(`${item.name} `, badges(this.model, node.id));
    // la recette reste entière : on sait qu'il faut quelque chose, pas quoi.
    // La racine n'est jamais floutée — l'ouvrir est une révélation délibérée.
    if (!isRoot && !state.availability.item(node.id)) spoil(name);

    const recipes = this.model.recipesFor(node.id);
    if (recipes.length > 1 && !node.loop) {
      const index = (state.choice.get(node.id) ?? 0) + 1;
      const swap = document.createElement("button");
      swap.type = "button";
      swap.className = "swap";
      swap.textContent = `${index}/${recipes.length}`;
      swap.title = "Switch recipe";
      swap.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.swapRecipe(node.id);
      });
      name.appendChild(swap);
    }

    // Le §5.3 réserve le clic simple au surlignage : ouvrir passe par un bouton
    // dédié, sinon on perdrait la synchronisation arbre ↔ bilan du §5.4.
    if (!isRoot) name.appendChild(this.openButton(node.id));

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = this.subtitle(node, state);

    text.append(name, sub);

    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = `×${node.qty}`;

    el.append(tile(this.model, item), text, qty);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.highlight(node.id);
      if (explodable) this.callbacks.toggle(node.path);
    });
    return el;
  }

  private openButton(id: ItemId): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "open";
    button.textContent = "↗";
    button.title = `Open ${this.model.item(id).name} as the current item`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.open(id);
    });
    return button;
  }

  private subtitle(node: TreeNode, state: TreeState): string {
    if (node.loop) return "loop — already above in this branch";
    if (node.recipe) {
      if (state.expanded.has(node.path)) return "click to collapse";
      const n = node.recipe.inputs.length;
      const alt = node.alternative ? "alternative recipe, " : "";
      return `${alt}${n} component${n > 1 ? "s" : ""} — click to expand`;
    }
    const item = this.model.item(node.id);
    // ne nommer une zone que si elle est découverte : le sous-titre d'une
    // feuille ne doit pas révéler la géographie qu'on vient de flouter
    const zone = item.sources.find(
      (s) => s.zone && state.availability.zone(s.zone))?.zone;
    if (zone) return zone;
    if (!state.availability.item(node.id)) return "undiscovered";
    const [first] = this.model.collectibles(node.id);
    if (first) return `via ${this.model.item(first.origin).name}`;
    return item.sources[0] ? "see the panel" : "no known source";
  }
}
