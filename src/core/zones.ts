import type { ItemId, Source } from "../data/types";
import type { Model } from "./tree";
import type { Totals } from "./totals";

export const OTHER_METHODS = "Other methods";

/** Provenance indirecte : on ramasse l'origine, pas l'item lui-même. */
export interface Via {
  origin: ItemId;
  /** La source de l'item qui mène à cette origine (démonter, cuire, planter…). */
  through: Source;
  /** Les sources de l'origine qui expliquent où la trouver dans cette zone. */
  sources: Source[];
}

export interface ZoneEntry {
  id: ItemId;
  qty: number;
  sources: Source[];
  /** Intermédiaire dual fabriqué par défaut : le looter évite un craft (§5.4.3). */
  optional: boolean;
  via?: Via;
}

export interface ZoneGroup {
  name: string;
  entries: ZoneEntry[];
}

/**
 * Regroupe le bilan par secteur (§5.4.3).
 *
 * Les ressources de base viennent en premier dans chaque zone, puis les
 * intermédiaires duals qu'on a choisi de crafter mais qu'on peut ramasser ici.
 * Les sources sans zone (salvage, marchand non localisé) tombent dans une
 * pseudo-zone placée en dernier.
 */
export function groupByZone(model: Model, totals: Totals): ZoneGroup[] {
  const groups = new Map<string, ZoneEntry[]>();

  const push = (zone: string, entry: ZoneEntry) => {
    const list = groups.get(zone);
    if (list) list.push(entry);
    else groups.set(zone, [entry]);
  };

  const spread = (id: ItemId, qty: number, optional: boolean) => {
    const byZone = new Map<string, Source[]>();
    for (const source of model.item(id).sources) {
      const zone = source.zone ?? OTHER_METHODS;
      const list = byZone.get(zone);
      if (list) list.push(source);
      else byZone.set(zone, [source]);
    }

    // Un item qu'on n'obtient qu'en transformant un autre n'a aucune zone à lui :
    // « démonter un extincteur » ne dit pas où trouver l'extincteur. On le range
    // donc sous les zones de son origine, marqué `via`. Un item déjà localisé
    // n'est pas touché — sinon Metal Scrap et ses six origines de salvage
    // apparaîtraient partout.
    if (!byZone.has(OTHER_METHODS) || byZone.size > 1) {
      for (const [zone, sources] of byZone) push(zone, { id, qty, sources, optional });
      return;
    }
    const indirect = indirectZones(model, id);
    if (indirect.size === 0) {
      for (const [zone, sources] of byZone) push(zone, { id, qty, sources, optional });
      return;
    }
    for (const [zone, via] of indirect) {
      push(zone, { id, qty, sources: via.sources, optional, via });
    }
  };

  for (const [id, qty] of totals.base) spread(id, qty, false);
  for (const [id, qty] of totals.steps) {
    if (model.isDual(id)) spread(id, qty, true);
  }

  return [...groups.entries()]
    .map(([name, entries]) => ({
      name,
      entries: entries.sort(
        (a, b) => Number(a.optional) - Number(b.optional) || b.qty - a.qty,
      ),
    }))
    .sort((a, b) => rank(model, a.name) - rank(model, b.name));
}

/**
 * Zones héritées des origines de l'item, sur **un seul niveau**.
 *
 * Un niveau suffit : la mesure sur les données réelles ne gagne rien au-delà,
 * et s'arrêter là évite les cycles du type Anteverse Wheat Seed ↔ Anteverse
 * Wheat.
 */
function indirectZones(model: Model, id: ItemId): Map<string, Via> {
  const out = new Map<string, Via>();
  for (const { origin, via, sources } of model.collectibles(id)) {
    const byZone = new Map<string, Source[]>();
    for (const source of sources) {
      if (!source.zone) continue;
      const list = byZone.get(source.zone);
      if (list) list.push(source);
      else byZone.set(source.zone, [source]);
    }
    for (const [zone, zoneSources] of byZone) {
      if (!out.has(zone)) out.set(zone, { origin, through: via, sources: zoneSources });
    }
  }
  return out;
}

function rank(model: Model, zone: string): number {
  return zone === OTHER_METHODS ? Number.MAX_SAFE_INTEGER : model.zoneRank(zone);
}
