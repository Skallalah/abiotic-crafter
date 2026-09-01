import type { ItemId, Source } from "../data/types";
import type { Availability } from "./discovery";
import type { Model } from "./tree";
import type { Totals } from "./totals";

export const OTHER_METHODS = "Other methods";

/**
 * Pseudo-zone des items requis dont aucune source n'est dans une zone
 * découverte (§5.7) : ils restent au bilan — la recette en a besoin — mais
 * leur géographie n'est pas révélée.
 */
export const BEYOND = "Beyond known zones";

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
export function groupByZone(
  model: Model,
  totals: Totals,
  availability?: Availability,
): ZoneGroup[] {
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
      // une source en zone non découverte n'existe pas pour le bilan
      if (availability && !availability.zone(zone)) continue;
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
      // rien de visible nulle part : l'item requis reste au bilan, sa
      // géographie non révélée, sous la pseudo-zone « Beyond known zones »
      if (byZone.size === 0) push(BEYOND, { id, qty, sources: [], optional });
      for (const [zone, sources] of byZone) push(zone, { id, qty, sources, optional });
      return;
    }
    const indirect = indirectZones(model, id, availability);
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
function indirectZones(
  model: Model,
  id: ItemId,
  availability?: Availability,
): Map<string, Via> {
  const out = new Map<string, Via>();
  for (const { origin, via, sources } of model.collectibles(id)) {
    const byZone = new Map<string, Source[]>();
    for (const source of sources) {
      if (!source.zone) continue;
      if (availability && !availability.zone(source.zone)) continue;
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
  if (zone === BEYOND) return Number.MAX_SAFE_INTEGER;       // tout en bas
  if (zone === OTHER_METHODS) return Number.MAX_SAFE_INTEGER - 1;
  return model.zoneRank(zone);
}
