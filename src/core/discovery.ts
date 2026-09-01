import type { ItemId, ProviderId, Source } from "../data/types";
import type { Model } from "./tree";
import { OTHER_METHODS } from "./zones";

/**
 * Les natures de contenants qui, sans zone déclarée, existent réellement
 * partout : le mobilier générique (casiers, étagères, canapés). Une créature
 * ou une caisse sans donnée de zone, elle, vit *quelque part* — l'ignorer
 * rendait Capacitor disponible via un Power Leech jamais localisé.
 */
const GENERIC_KINDS = new Set(["container", "pickup", "salvage"]);

/**
 * Suivi de découverte (§5.7) : quelles zones le joueur a explorées.
 *
 * C'est de la configuration locale, pas de la donnée : l'état vit dans
 * l'interface (src/ui/discover.ts) et tout le calcul est ici, pur et testé.
 */
/** Traitement des items hors zones : caviardé (défaut), flouté, ou en clair. */
export type SpoilerMode = "hide" | "blur" | "show";

export interface DiscoveryState {
  enabled: boolean;
  zones: ReadonlySet<string>;
  /** Absent dans un vieux stockage : vaut « hide ». */
  spoilers?: SpoilerMode;
}

export interface FrontierEntry {
  zone: string;
  /** Zone que rien ne relie dans le wiki : proposée en permanence, à part. */
  uncharted: boolean;
}

/**
 * Zones découvrables depuis l'état courant, dans l'ordre de progression.
 *
 * Un secteur est en frontière si un de ses voisins (`links`, lus dans les
 * DEUX sens — le wiki les déclare parfois en sens unique) est découvert ; un
 * monde-portail dès que son secteur l'est, et réciproquement. Les orphelines,
 * que rien ne relie, sont toujours proposées, marquées `uncharted` : les
 * cacher à jamais serait pire que d'avouer que la donnée ne sait pas.
 */
export function frontier(model: Model, state: DiscoveryState): FrontierEntry[] {
  const discovered = state.zones;
  const out: FrontierEntry[] = [];

  for (const zone of model.ds.zones) {
    if (discovered.has(zone.name)) continue;
    const linked = new Set<string>();
    for (const link of zone.links ?? []) linked.add(link);
    if (zone.parent) linked.add(zone.parent);
    for (const other of model.ds.zones) {
      if (other.links?.includes(zone.name)) linked.add(other.name);
      if (other.parent === zone.name) linked.add(other.name);
    }

    if (linked.size === 0) {
      out.push({ zone: zone.name, uncharted: true });
    } else if ([...linked].some((name) => discovered.has(name))) {
      out.push({ zone: zone.name, uncharted: false });
    }
  }
  return out;
}

/** Réponses de disponibilité, précalculées pour un état de découverte donné. */
export interface Availability {
  readonly enabled: boolean;
  /** Comment présenter l'indisponible : [REDACTED], flou, ou en clair. */
  readonly spoilers: SpoilerMode;
  item(id: ItemId): boolean;
  provider(id: ProviderId): boolean;
  /** La zone est-elle découverte ? La pseudo-zone du bilan l'est toujours. */
  zone(name: string): boolean;
  /** La source peut-elle être montrée ? (sa zone est visible, ou elle n'en a pas) */
  source(source: Source): boolean;
}

const EVERYTHING: Omit<Availability, "enabled" | "spoilers"> = {
  item: () => true,
  provider: () => true,
  zone: () => true,
  source: () => true,
};

/**
 * Le point fixe de disponibilité — la sémantique a été mesurée avant d'être
 * écrite (cf. DECISIONS.md). Un item est disponible si :
 *  - une source porte une zone découverte ;
 *  - une source sans zone dérive (`from`) d'un item disponible — et, si cet
 *    item est une caisse verrouillée (`unlockedBy`), sa clé l'est aussi ;
 *  - une source sans zone vise (`targetId`) un contenant disponible ;
 *  - une source n'a aucune géographie du tout (prose, marchand sans lieu) ;
 *  - un contenant ou une créature disponible le lâche (`drops`) ;
 *  - une recette de craft a TOUS ses ingrédients disponibles ;
 *  - ou la donnée ne sait le localiser nulle part : ce qui n'est pas
 *    disponible même toutes zones cochées n'est jamais caché. Cette clôture
 *    garantit l'invariant « tout découvert = app entière » par construction.
 *
 * Un contenant est disponible si une de ses zones est découverte, ou s'il n'en
 * déclare aucune (les casiers génériques existent partout).
 */
export function computeAvailability(model: Model, state: DiscoveryState): Availability {
  // suivi coupé : tout est disponible, le mode n'a plus rien à voiler
  if (!state.enabled) return { enabled: false, spoilers: "show", ...EVERYTHING };

  const discovered = state.zones;
  const providers = availableProviders(model, discovered);
  const madeBy = recipeIndex(model);
  const items = reachable(model, discovered, providers, madeBy);

  // Jamais localisables : invisibles même toutes zones cochées. Deux natures :
  //  - une acquisition que la donnée ne décrit pas (des sources mortes, ou
  //    rien du tout) → toujours visible, inconnu n'est pas spoiler ;
  //  - un PUR CRAFT (aucune source, une recette) : son acquisition est
  //    parfaitement décrite — c'est sa recette qui doit le justifier, et elle
  //    ne le fait que si TOUS ses ingrédients sont visibles. L'Electro Pest
  //    réclame un Capacitor : tant que le Capacitor est caché, lui aussi.
  const pureCrafts: ItemId[] = [];
  for (const id of neverLocalisable(model)) {
    if (model.item(id).sources.length === 0 && madeBy.has(id)) pureCrafts.push(id);
    else items.add(id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of pureCrafts) {
      if (items.has(id)) continue;
      if (madeBy.get(id)!.some((inputs) => inputs.every((i) => items.has(i)))) {
        items.add(id);
        changed = true;
      }
    }
  }

  return {
    enabled: true,
    spoilers: state.spoilers ?? "hide",
    item: (id) => items.has(id),
    provider: (id) => providers.has(id),
    zone: (name) => name === OTHER_METHODS || discovered.has(name),
    source: (source) =>
      (!source.zone || discovered.has(source.zone))
      && (!source.requiresZone || discovered.has(source.requiresZone)),
  };
}

function availableProviders(
  model: Model,
  discovered: ReadonlySet<string>,
): Set<ProviderId> {
  const out = new Set<ProviderId>();
  for (const provider of Object.values(model.ds.providers)) {
    const zones = provider.zones;
    // une zone à présence retardée ne compte qu'une fois sa condition levée
    if (zones.some((z) => discovered.has(z.zone)
                          && (!z.requires || discovered.has(z.requires)))
        || (zones.length === 0 && GENERIC_KINDS.has(provider.kind))) {
      out.add(provider.id);
    }
  }
  return out;
}

/** Le point fixe brut, sans la clôture des jamais-localisables. */
/**
 * Ce qui fabrique quoi — craft ET upgrade, les deux fabriquent. Les armures
 * A.E.G.I.S. ne sortent que d'améliorations : les ignorer les rangeait en
 * « jamais localisables ».
 */
function recipeIndex(model: Model): Map<ItemId, ItemId[][]> {
  const madeBy = new Map<ItemId, ItemId[][]>();
  for (const recipe of model.ds.recipes) {
    const list = madeBy.get(recipe.output.item);
    const inputs = recipe.inputs.map((input) => input.item);
    if (list) list.push(inputs);
    else madeBy.set(recipe.output.item, [inputs]);
  }
  return madeBy;
}

function reachable(
  model: Model,
  discovered: ReadonlySet<string>,
  providers: ReadonlySet<ProviderId>,
  madeBy: Map<ItemId, ItemId[][]>,
): Set<ItemId> {
  const dropped = new Set<ItemId>();
  for (const id of providers) {
    for (const drop of model.provider(id)!.drops) {
      // une chance sans « % » est une condition de progression (« Completing
      // Canaan… ») : le contenant est là, pas ce qu'il lâche
      if (drop.chanceText && !drop.chanceText.includes("%")) continue;
      dropped.add(drop.item);
    }
  }

  const available = new Set<ItemId>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of Object.values(model.ds.items)) {
      if (available.has(item.id)) continue;
      const ok =
        item.sources.some((s) =>
          s.conditional || (s.requiresZone && !discovered.has(s.requiresZone))
            ? false
            : s.zone
            ? discovered.has(s.zone)
            : s.from
              // le contenu d'une caisse verrouillée n'existe que pour qui
              // tient la clé : la Cacophonous Crate est posée dans Office,
              // mais son Organ attend la Porcelain Key des Symphonists
              ? available.has(s.from)
                && (!model.ds.items[s.from]?.unlockedBy
                    || available.has(model.ds.items[s.from]!.unlockedBy!))
              : s.targetId
                ? providers.has(s.targetId)
                // une cible nommée mais jamais résolue (« kill Order ») vit
                // quelque part : ce n'est pas un lieu inconnu, c'est un lieu
                // qu'on ne sait pas vérifier — elle ne prouve rien ici
                : !s.target) ||
        dropped.has(item.id) ||
        (madeBy.get(item.id) ?? []).some((inputs) =>
          inputs.every((input) => available.has(input)));
      if (ok) {
        available.add(item.id);
        changed = true;
      }
    }
  }
  return available;
}

/** Mémoïsé par Model : le dataset ne change pas en cours de session. */
const NEVER = new WeakMap<Model, ReadonlySet<ItemId>>();

function neverLocalisable(model: Model): ReadonlySet<ItemId> {
  let cached = NEVER.get(model);
  if (!cached) {
    // les mêmes règles que le point fixe courant, toutes zones cochées : la
    // clôture ne vaut que si elle mesure exactement ce que le filtre mesure
    const allZones = new Set(model.ds.zones.map((z) => z.name));
    const atFull = reachable(model, allZones, availableProviders(model, allZones),
                             recipeIndex(model));
    cached = new Set(
      Object.keys(model.ds.items).filter((id) => !atFull.has(id)),
    );
    NEVER.set(model, cached);
  }
  return cached;
}
