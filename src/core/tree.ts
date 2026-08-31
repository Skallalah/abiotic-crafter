import type { Dataset, ItemId, Provider, ProviderId, Recipe, Source } from "../data/types";

/** Index dérivé du dataset. Rien de tout ceci n'est stocké dans le JSON (§3). */
export class Model {
  readonly ds: Dataset;
  private readonly craftRecipes = new Map<ItemId, Recipe[]>();
  private readonly consumers = new Map<ItemId, Recipe[]>();
  private readonly zoneOrder = new Map<string, number>();

  constructor(ds: Dataset) {
    this.ds = ds;
    for (const recipe of ds.recipes) {
      if (recipe.kind !== "craft") continue;
      const list = this.craftRecipes.get(recipe.output.item);
      if (list) list.push(recipe);
      else this.craftRecipes.set(recipe.output.item, [recipe]);

      // index inverse : quelles recettes consomment cet ingrédient
      for (const input of new Set(recipe.inputs.map((i) => i.item))) {
        const users = this.consumers.get(input);
        if (users) users.push(recipe);
        else this.consumers.set(input, [recipe]);
      }
    }
    for (const zone of ds.zones) this.zoneOrder.set(zone.name, zone.order);
  }

  item(id: ItemId) {
    const it = this.ds.items[id];
    if (!it) throw new Error(`item inconnu : ${id}`);
    return it;
  }

  has(id: ItemId): boolean {
    return id in this.ds.items;
  }

  /** Contenant ou créature ; `undefined` si aucune fenêtre n'existe pour lui. */
  provider(id: ProviderId): Provider | undefined {
    return this.ds.providers[id];
  }

  hasProvider(id: ProviderId): boolean {
    return id in this.ds.providers;
  }

  /** Toutes les recettes de craft d'un item, dans l'ordre du fichier. */
  recipesFor(id: ItemId): Recipe[] {
    return this.craftRecipes.get(id) ?? [];
  }

  /**
   * Recettes de craft qui consomment cet item — les « liens montants ».
   *
   * Un item peut être consommé par plusieurs recettes du même résultat ; on
   * n'en garde qu'une par résultat, et jamais l'item lui-même (une recette qui
   * se consommerait elle-même n'a rien à montrer au-dessus de sa propre racine).
   */
  usedIn(id: ItemId): { item: ItemId; qty: number }[] {
    const byOutput = new Map<ItemId, number>();
    for (const recipe of this.consumers.get(id) ?? []) {
      const output = recipe.output.item;
      if (output === id || byOutput.has(output)) continue;
      const input = recipe.inputs.find((i) => i.item === id);
      byOutput.set(output, input?.qty ?? 1);
    }
    return [...byOutput]
      .map(([item, qty]) => ({ item, qty }))
      .sort((a, b) => this.item(a.item).name.localeCompare(this.item(b.item).name, "en"));
  }

  /**
   * Item dont celui-ci dérive, pour une source donnée.
   *
   * `from` est posé par le scraper pour toute source qui transforme un autre
   * objet — démonter un extincteur donne une Canister, faire cuire un Raw Pest
   * donne un Cooked Pest. C'est le seul champ à consulter : la résolution des
   * noms a déjà été faite côté scraper, qui connaît les zones et les établis.
   */
  originOf(source: Source): ItemId | undefined {
    return source.from && this.has(source.from) ? source.from : undefined;
  }

  /** Item qu'on n'obtient qu'en transformant un autre : toutes ses sources dérivent. */
  isDerived(id: ItemId): boolean {
    const sources = this.item(id).sources;
    return sources.length > 0 && sources.every((s) => this.originOf(s) !== undefined);
  }

  /**
   * Ce qu'il faut réellement aller chercher pour obtenir cet item.
   *
   * Une source dérivée ne dit que « démonter un extincteur » et cache le lieu
   * de spawn ; on renvoie donc l'origine avec ses propres sources, qui elles
   * portent la zone.
   */
  collectibles(id: ItemId): { origin: ItemId; via: Source; sources: Source[] }[] {
    const seen = new Set<ItemId>();
    const out: { origin: ItemId; via: Source; sources: Source[] }[] = [];
    for (const source of this.item(id).sources) {
      const origin = this.originOf(source);
      if (!origin || seen.has(origin)) continue;
      seen.add(origin);
      out.push({ origin, via: source, sources: this.item(origin).sources });
    }
    return out;
  }

  isCraftable(id: ItemId): boolean {
    return this.craftRecipes.has(id);
  }

  isLootable(id: ItemId): boolean {
    return this.item(id).sources.length > 0;
  }

  isDual(id: ItemId): boolean {
    return this.isCraftable(id) && this.isLootable(id);
  }

  /** Voie retenue pour le bilan. Défaut `loot` pour un dual sans `primary`. */
  primaryWay(id: ItemId): "craft" | "loot" {
    if (this.isDual(id)) return this.item(id).primary ?? "loot";
    return this.isCraftable(id) ? "craft" : "loot";
  }

  /** Un item est une feuille du bilan dès que sa voie principale est le loot. */
  isLeaf(id: ItemId): boolean {
    return this.primaryWay(id) !== "craft";
  }

  zoneRank(name: string): number {
    return this.zoneOrder.get(name) ?? Number.MAX_SAFE_INTEGER;
  }
}

/** Recette active par item, quand plusieurs existent. Index dans `recipesFor`. */
export type RecipeChoice = ReadonlyMap<ItemId, number>;

export function chosenRecipe(
  model: Model,
  id: ItemId,
  choice: RecipeChoice,
): Recipe | undefined {
  const list = model.recipesFor(id);
  if (list.length === 0) return undefined;
  const index = choice.get(id) ?? 0;
  return list[Math.min(index, list.length - 1)];
}

export interface TreeNode {
  id: ItemId;
  /** Quantité **dans cette recette**, pas le cumul (§5.3). */
  qty: number;
  /** Chemin depuis la racine : `keypad_hacker/controller/computation_brick`. */
  path: string;
  recipe?: Recipe;
  children: TreeNode[];
  /** Vrai si l'item réapparaît sur son propre chemin : le rendu s'arrête là. */
  loop: boolean;
  /** Vrai si la recette affichée n'est pas la voie principale de l'item. */
  alternative: boolean;
}

/**
 * Construit l'arbre complet sous une racine.
 *
 * `expandLeafRecipes` déplie aussi les recettes alternatives des duals dont la
 * voie principale est le loot. Le bilan ne l'utilise jamais : il ne descend que
 * la voie principale, ce qui est précisément ce qui rend l'affichage
 * indépendant du bilan (§8).
 */
export function buildTree(
  model: Model,
  root: ItemId,
  choice: RecipeChoice,
  opts: { expandLeafRecipes?: boolean } = {},
): TreeNode {
  const visit = (id: ItemId, qty: number, path: string, ancestors: ReadonlySet<ItemId>): TreeNode => {
    const alternative = model.isDual(id) && model.primaryWay(id) === "loot";
    const wanted = !model.isLeaf(id) || (opts.expandLeafRecipes === true && alternative);
    const recipe = wanted ? chosenRecipe(model, id, choice) : undefined;

    if (!recipe) {
      return { id, qty, path, children: [], loop: false, alternative };
    }
    if (ancestors.has(id)) {
      // deuxième occurrence sur le même chemin : on coupe et on marque la boucle
      return { id, qty, path, children: [], loop: true, alternative };
    }

    const nextAncestors = new Set(ancestors).add(id);
    const children = recipe.inputs.map((input) =>
      visit(input.item, input.qty, `${path}/${input.item}`, nextAncestors),
    );
    return { id, qty, path, recipe, children, loop: false, alternative };
  };

  return visit(root, 1, root, new Set());
}
