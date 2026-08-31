import { chosenRecipe, type Model, type RecipeChoice } from "./tree";
import type { ItemId } from "../data/types";

export interface Totals {
  /** Ressources à ramasser, cumulées. */
  base: Map<ItemId, number>;
  /** Items à fabriquer, racine comprise, cumulés. */
  steps: Map<ItemId, number>;
  /** Profondeur d'apparition **maximale** : sert à ordonner les crafts. */
  depth: Map<ItemId, number>;
  /** Items rencontrés deux fois sur un même chemin. */
  loops: Set<ItemId>;
}

/**
 * Bilan récursif d'une racine (§7).
 *
 * `expanded` suit le dépli de l'arbre : un nœud replié n'est pas décomposé, il
 * compte comme un objet à se procurer entier. Omettre l'argument redonne le
 * bilan complet, indépendant de l'affichage — c'est ce que font les tests
 * d'algorithme, qui n'ont pas à connaître l'UI.
 *
 * Les chemins suivent exactement le schéma de `buildTree`
 * (`keypad_hacker/controller/computation_brick`) : les deux parcours doivent
 * décider pareil, sinon la colonne de droite ne décrirait plus l'arbre affiché.
 */
export function computeTotals(
  model: Model,
  root: ItemId,
  choice: RecipeChoice,
  rootQty = 1,
  expanded?: ReadonlySet<string>,
): Totals {
  const base = new Map<ItemId, number>();
  const steps = new Map<ItemId, number>();
  const depth = new Map<ItemId, number>();
  const loops = new Set<ItemId>();

  const bump = (map: Map<ItemId, number>, id: ItemId, n: number) =>
    map.set(id, (map.get(id) ?? 0) + n);

  const visit = (
    id: ItemId,
    qty: number,
    d: number,
    path: string,
    ancestors: ReadonlySet<ItemId>,
  ) => {
    depth.set(id, Math.max(depth.get(id) ?? 0, d));

    if (model.isLeaf(id) || ancestors.has(id)) {
      if (ancestors.has(id)) loops.add(id);
      bump(base, id, qty);
      return;
    }

    // replié : on le compte comme un objet à se procurer entier
    if (expanded && !expanded.has(path)) {
      bump(base, id, qty);
      return;
    }

    const recipe = chosenRecipe(model, id, choice);
    if (!recipe) {
      bump(base, id, qty);
      return;
    }

    bump(steps, id, qty);

    // Une recette peut produire plusieurs unités : on compte des *crafts*, pas
    // des unités, et les ingrédients suivent le nombre de crafts (§7).
    const perCraft = Math.max(1, recipe.output.qty);
    const crafts = Math.ceil(qty / perCraft);
    const nextAncestors = new Set(ancestors).add(id);
    for (const input of recipe.inputs) {
      visit(input.item, input.qty * crafts, d + 1, `${path}/${input.item}`, nextAncestors);
    }
  };

  visit(root, rootQty, 0, root, new Set());
  return { base, steps, depth, loops };
}

/** Ordre de fabrication : le plus profond d'abord, donc jamais avant ses ingrédients. */
export function craftOrder(totals: Totals): ItemId[] {
  return [...totals.steps.keys()].sort(
    (a, b) => (totals.depth.get(b) ?? 0) - (totals.depth.get(a) ?? 0),
  );
}
