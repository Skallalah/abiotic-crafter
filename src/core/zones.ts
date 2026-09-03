import type { ItemId, Provider, Source } from "../data/types";
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
 * Zones où une source s'exerce vraiment : la sienne quand elle en a une,
 * sinon celles de son origine — « ouvrir une Toolbox » se fait là où sont les
 * Toolbox, pas dans les limbes. L'origine peut être un contenant (`targetId`)
 * ou un item (`from`) ; leurs zones s'unissent. Vide : la méthode reste
 * réellement sans géographie (Autres méthodes).
 *
 * Avec `availability`, une origine non disponible ne révèle rien (la source
 * reste en Autres méthodes, voilée comme aujourd'hui) et les zones non
 * découvertes sont tues.
 */
export function sourceZones(
  model: Model,
  source: Source,
  availability?: Availability,
): string[] {
  if (source.zone) return [source.zone];
  const zones = new Set<string>();
  const provider = source.targetId ? model.provider(source.targetId) : undefined;
  if (provider && (!availability || availability.provider(provider.id))) {
    for (const z of provider.zones) zones.add(z.zone);
  }
  if (source.from && model.has(source.from)
      && (!availability || availability.item(source.from))) {
    for (const s of model.item(source.from).sources) {
      if (s.zone) zones.add(s.zone);
    }
  }
  return [...zones].filter((z) => !availability || availability.zone(z));
}

/**
 * Les contenants dont la table de loot (Cargo) contient l'item — le
 * complément des « LOOT » nus : la donnée sait déjà quelles boîtes ouvrir.
 *
 * Un contenant localisé rend une ligne par zone ; un contenant SANS zone est
 * un vrai générique — des casiers dans toutes les zones, la condition sine
 * qua non — et tombe en Autres méthodes. Un contenant déjà cité par une
 * source explicite de l'item est ignoré (dédoublonnage).
 */
export function containerSources(
  model: Model,
  id: ItemId,
  availability?: Availability,
): { zone: string; source: Source }[] {
  const out: { zone: string; source: Source }[] = [];
  const cited = new Set(
    model.item(id).sources.flatMap((s) => [s.targetId, s.target]));
  for (const provider of model.containers()) {
    if (!provider.drops.some((d) => d.item === id)) continue;
    if (cited.has(provider.id) || cited.has(provider.name)) continue;
    if (availability && !availability.provider(provider.id)) continue;
    const source: Source = {
      kind: "pickup", target: provider.name, targetId: provider.id,
    };
    if (provider.zones.length === 0) {
      out.push({ zone: OTHER_METHODS, source });
      continue;
    }
    for (const { zone } of provider.zones) {
      if (availability && !availability.zone(zone)) continue;
      out.push({ zone, source });
    }
  }
  return out;
}

/**
 * L'inventaire d'un secteur — la question inverse des fenêtres d'item :
 * « qu'est-ce que je trouve ici ? ».
 *
 * Les items ne viennent que des sources pickup de la zone : un objet qu'on y
 * casse ou qu'on y tue apparaît via son provider, pas en double dans les
 * listes. Un pickup certifié `env` (=== Environment === de la page secteur)
 * l'emporte sur un pickup d'infobox du même item. Les providers du secteur
 * se rangent par famille : contenants à ouvrir, créatures (tuées ou
 * dépecées), nœuds de ressources (cassés, démontés, ramassés). Les marchands
 * n'ont pas de fiche : seuls leurs noms, cités par les échanges de la zone.
 */
export interface ZoneContents {
  /** Certifiés « posés dans le décor ». */
  env: ItemId[];
  /** Pickups d'infobox : « trouvable ici », sans plus. */
  somewhere: ItemId[];
  containers: Provider[];
  creatures: Provider[];
  nodes: Provider[];
  /** Nom + les échanges qui le citent : la fenêtre demande à la découverte
   *  si le marchand est déjà là (un `requiresZone` peut tous les retarder). */
  traders: { name: string; sources: Source[] }[];
}

const CREATURE_KINDS = new Set<Provider["kind"]>(["enemy", "butcher"]);

export function zoneContents(model: Model, zone: string): ZoneContents {
  const env = new Set<ItemId>();
  const somewhere = new Set<ItemId>();
  const traders = new Map<string, Source[]>();
  for (const item of Object.values(model.ds.items)) {
    for (const source of item.sources) {
      if (source.zone !== zone) continue;
      if (source.kind === "pickup") (source.env ? env : somewhere).add(item.id);
      else if (source.kind === "vendor" && source.target) {
        const list = traders.get(source.target);
        if (list) list.push(source);
        else traders.set(source.target, [source]);
      }
    }
  }
  for (const id of env) somewhere.delete(id);

  const containers: Provider[] = [];
  const creatures: Provider[] = [];
  const nodes: Provider[] = [];
  for (const provider of Object.values(model.ds.providers)) {
    if (!provider.zones.some((z) => z.zone === zone)) continue;
    if (provider.kind === "container") containers.push(provider);
    else if (CREATURE_KINDS.has(provider.kind)) creatures.push(provider);
    else nodes.push(provider);
  }

  const byName = (a: ItemId, b: ItemId) =>
    model.item(a).name.localeCompare(model.item(b).name, "en");
  const providersByName = (a: Provider, b: Provider) =>
    a.name.localeCompare(b.name, "en");
  return {
    env: [...env].sort(byName),
    somewhere: [...somewhere].sort(byName),
    containers: containers.sort(providersByName),
    creatures: creatures.sort(providersByName),
    nodes: nodes.sort(providersByName),
    traders: [...traders]
      .map(([name, sources]) => ({ name, sources }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}

/**
 * Regroupe le bilan par secteur (§5.4.3).
 *
 * Les ressources de base viennent en premier dans chaque zone, puis les
 * intermédiaires duals qu'on a choisi de crafter mais qu'on peut ramasser ici.
 * Une source sans zone rejoint les zones de son origine quand elle est
 * localisée (`sourceZones`) ; ce qui reste vraiment sans géographie tombe
 * dans une pseudo-zone placée en dernier.
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
    const add = (zone: string, source: Source) => {
      const list = byZone.get(zone);
      if (list) list.push(source);
      else byZone.set(zone, [source]);
    };
    for (const source of model.item(id).sources) {
      const zone = source.zone ?? OTHER_METHODS;
      // une source en zone non découverte n'existe pas pour le bilan
      if (availability && !availability.zone(zone)) continue;
      add(zone, source);
    }

    // Un item qu'on n'obtient qu'en transformant un autre n'a aucune zone à
    // lui : « démonter un extincteur » ne dit pas où trouver l'extincteur. On
    // le range donc sous les zones de son origine, marqué `via` — la ligne
    // raconte le chemin entier (ramasser l'extincteur, PUIS le démonter).
    if (byZone.size === 1 && byZone.has(OTHER_METHODS)) {
      const indirect = indirectZones(model, id, availability);
      if (indirect.size > 0) {
        for (const [zone, via] of indirect) {
          push(zone, { id, qty, sources: via.sources, optional, via });
        }
        return;
      }
    }

    // Une méthode sans zone rejoint les zones de son origine localisée :
    // « ouvrir une Toolbox » se joue à Office, où sont les Toolbox. Seul ce
    // qui reste vraiment sans géographie garde la pseudo-zone.
    const limbo = byZone.get(OTHER_METHODS);
    if (limbo) {
      byZone.delete(OTHER_METHODS);
      for (const source of limbo) {
        const zones = sourceZones(model, source, availability);
        if (zones.length === 0) add(OTHER_METHODS, source);
        for (const zone of zones) add(zone, source);
      }
    }

    // les tables de loot complètent : les contenants qui lâchent l'item,
    // sous leur zone — un générique (sans zone = partout) en Autres méthodes
    for (const { zone, source } of containerSources(model, id, availability)) {
      add(zone, source);
    }

    // rien de visible nulle part : l'item requis reste au bilan, sa
    // géographie non révélée, sous la pseudo-zone « Beyond known zones »
    if (byZone.size === 0) push(BEYOND, { id, qty, sources: [], optional });
    for (const [zone, sources] of byZone) push(zone, { id, qty, sources, optional });
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
