import { computeTotals, type Totals } from "./totals";
import type { Model, RecipeChoice } from "./tree";
import type { ItemId } from "../data/types";

/**
 * Le plan de courses (§5.8) : plusieurs objectifs de craft à la fois.
 *
 * Le bilan de droite décrit UN arbre ; le geste du joueur avant une session
 * est « ce soir on fabrique X, Y et Z — on ramasse quoi, où ? ». Le plan est
 * la somme des bilans **entièrement dépliés** de chaque objectif.
 */

export interface PlanGoal {
  id: ItemId;
  qty: number;
}

/**
 * Fusionne les besoins de tous les objectifs.
 *
 * Chaque objectif est un `computeTotals` complet (sans `expanded`) ; les
 * cartes se somment, la profondeur prend le max (l'ordre de craft reste sûr),
 * les cycles s'unissent. L'arrondi des recettes à lots (« makes 4 ») se fait
 * PAR objectif : deux objectifs demandant 3 munitions chacun coûtent 2 + 2
 * crafts, pas 2 — c'est déjà la sémantique de l'app quand deux branches d'un
 * même arbre réclament le même intermédiaire, et un léger surplus de
 * munitions n'a jamais fâché personne (cf. DECISIONS.md).
 */
export function planTotals(
  model: Model,
  goals: readonly PlanGoal[],
  choice: RecipeChoice,
): Totals {
  const merged: Totals = {
    base: new Map(), steps: new Map(), depth: new Map(), loops: new Set(),
  };
  for (const goal of goals) {
    const totals = computeTotals(model, goal.id, choice, goal.qty);
    for (const [id, qty] of totals.base) {
      merged.base.set(id, (merged.base.get(id) ?? 0) + qty);
    }
    for (const [id, qty] of totals.steps) {
      merged.steps.set(id, (merged.steps.get(id) ?? 0) + qty);
    }
    for (const [id, d] of totals.depth) {
      merged.depth.set(id, Math.max(merged.depth.get(id) ?? 0, d));
    }
    for (const id of totals.loops) merged.loops.add(id);
  }
  return merged;
}
