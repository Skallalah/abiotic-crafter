import type { Dataset, Item, Overrides, Recipe } from "./types";

/**
 * Fusionne les corrections manuelles par-dessus les données scrapées (§3).
 *
 * Règle : fusion champ à champ par item, **sauf** `sources`, remplacé en bloc
 * s'il est présent dans l'override — une correction partielle d'une liste est
 * ambiguë, un remplacement ne l'est pas. Idem pour `recipes` au niveau du
 * dataset. Tout ce qui vient d'un override est marqué `verified`.
 */
export function mergeOverrides(scraped: Dataset, overrides: Overrides): Dataset {
  const items: Record<string, Item> = { ...scraped.items };

  for (const [id, patch] of Object.entries(overrides.items ?? {})) {
    const base = items[id];
    const merged = {
      ...(base ?? emptyItem(id)),
      ...patch,
      meta: { ...(base?.meta ?? newMeta()), verified: true },
    } as Item;
    // `sources` absent de l'override → on garde celles du scraper ;
    // présent → il remplace intégralement, même vide.
    merged.sources = patch.sources ?? base?.sources ?? [];
    merged.id = id;
    items[id] = merged;
  }

  const recipes: Recipe[] = overrides.recipes ?? scraped.recipes;
  const zones = overrides.zones ?? scraped.zones;
  const providers = overrides.providers ?? scraped.providers ?? {};

  return { items, recipes, zones, providers };
}

function newMeta(): Item["meta"] {
  return { fetchedAt: new Date().toISOString(), verified: true };
}

function emptyItem(id: ItemIdLike): Item {
  return {
    id,
    name: id,
    wikiTitle: id,
    category: "Divers",
    stack: 1,
    sources: [],
    meta: newMeta(),
  };
}

type ItemIdLike = string;
