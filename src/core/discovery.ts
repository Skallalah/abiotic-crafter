import type { ItemId, ProviderId, Source } from "../data/types";
import type { Model } from "./tree";
import { OTHER_METHODS } from "./zones";

/**
 * Suivi de découverte (§5.7) : quelles zones le joueur a explorées.
 *
 * C'est de la configuration locale, pas de la donnée : l'état vit dans
 * l'interface (src/ui/discover.ts) et tout le calcul est ici, pur et testé.
 */
export interface DiscoveryState {
  enabled: boolean;
  zones: ReadonlySet<string>;
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
  item(id: ItemId): boolean;
  provider(id: ProviderId): boolean;
  /** La zone est-elle découverte ? La pseudo-zone du bilan l'est toujours. */
  zone(name: string): boolean;
  /** La source peut-elle être montrée ? (sa zone est visible, ou elle n'en a pas) */
  source(source: Source): boolean;
}

const EVERYTHING: Omit<Availability, "enabled"> = {
  item: () => true,
  provider: () => true,
  zone: () => true,
  source: () => true,
};

/**
 * Le point fixe de disponibilité — la sémantique a été mesurée avant d'être
 * écrite (cf. DECISIONS.md). Un item est disponible si :
 *  - une source porte une zone découverte ;
 *  - une source sans zone dérive (`from`) d'un item disponible ;
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
  if (!state.enabled) return { enabled: false, ...EVERYTHING };

  const discovered = state.zones;
  const providers = new Set<ProviderId>();
  for (const provider of Object.values(model.ds.providers)) {
    const zones = provider.zones;
    if (zones.length === 0 || zones.some((z) => discovered.has(z.zone))) {
      providers.add(provider.id);
    }
  }

  const items = reachable(model, discovered, providers);
  // jamais localisables : invisibles même toutes zones cochées → toujours montrés
  for (const id of neverLocalisable(model)) items.add(id);

  return {
    enabled: true,
    item: (id) => items.has(id),
    provider: (id) => providers.has(id),
    zone: (name) => name === OTHER_METHODS || discovered.has(name),
    source: (source) => !source.zone || discovered.has(source.zone),
  };
}

/** Le point fixe brut, sans la clôture des jamais-localisables. */
function reachable(
  model: Model,
  discovered: ReadonlySet<string>,
  providers: ReadonlySet<ProviderId>,
): Set<ItemId> {
  const dropped = new Set<ItemId>();
  for (const id of providers) {
    for (const drop of model.provider(id)!.drops) dropped.add(drop.item);
  }

  const available = new Set<ItemId>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of Object.values(model.ds.items)) {
      if (available.has(item.id)) continue;
      const ok =
        item.sources.some((s) =>
          s.zone
            ? discovered.has(s.zone)
            : s.from
              ? available.has(s.from)
              : s.targetId
                ? providers.has(s.targetId)
                : true) ||
        dropped.has(item.id) ||
        model.recipesFor(item.id).some((r) =>
          r.inputs.every((input) => available.has(input.item)));
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
    const allZones = new Set(model.ds.zones.map((z) => z.name));
    const allProviders = new Set(Object.keys(model.ds.providers));
    const atFull = reachable(model, allZones, allProviders);
    cached = new Set(
      Object.keys(model.ds.items).filter((id) => !atFull.has(id)),
    );
    NEVER.set(model, cached);
  }
  return cached;
}
