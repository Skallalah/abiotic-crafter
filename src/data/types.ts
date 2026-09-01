/** Modèle de données — transcription du §3 de SPEC.md. */

export type ItemId = string;

export type SourceKind =
  | "pickup"
  | "break"
  | "drop"
  | "vendor"
  | "salvage"
  | "grow";

export interface Source {
  kind: SourceKind;
  /** Secteur du jeu. Absent pour salvage et pour les sources non localisées. */
  zone?: string;
  /**
   * Emplacements précis, un par entrée. Le wiki les liste sur deux niveaux
   * (`* Level 2` puis `** Bio Lab D.`) ; le préfixe de sous-zone est conservé
   * (`"Level 2 › Bio Lab D."`). Une source en prose donne une entrée unique.
   */
  where?: string[];
  /** Ce qu'on casse, tue, ou à qui on achète. */
  target?: string;
  /**
   * Le `Provider` que `target` désigne, quand il en a un. Posé par le scraper :
   * un rapprochement par nom au runtime confondrait l'item « Toolbox » et le
   * contenant « Toolbox », qui n'ont ni le même contenu ni la même image.
   */
  targetId?: ProviderId;
  /** L'item dont celui-ci dérive : démonté, cuisiné, planté. */
  from?: ItemId;
  /**
   * Quantité obtenue, bornes du wiki. `qtyMin` à 0 signifie que l'objet n'est
   * pas garanti — une Manufacturing Wood Crate donne 0 à 3 Box of Screws.
   * Conservé pour la justesse du dataset ; l'UI n'affiche que `qtyMax`.
   */
  qtyMin?: number;
  qtyMax?: number;
  /**
   * Drop soumis à une condition de progression (« Completing Canaan… ») : la
   * table du wiki l'écrit dans sa colonne de chance, sans « % ». Affiché comme
   * les autres, mais il ne prouve jamais une disponibilité (§5.7).
   */
  conditional?: boolean;
}

export interface Item {
  id: ItemId;
  name: string;
  wikiTitle: string;
  icon?: string;
  category: string;
  description?: string;
  stack: number;
  weight?: number;
  researchMaterial?: string;
  gearSlot?: string;
  /** Façons de l'obtenir sans le crafter. */
  sources: Source[];
  /** Uniquement si l'item est à la fois craftable et lootable. */
  primary?: "craft" | "loot";
  meta: { wikiRevision?: number; fetchedAt: string; verified: boolean };
}

export type RecipeKind = "craft" | "upgrade" | "salvage" | "trade";

export interface Recipe {
  id: string;
  kind: RecipeKind;
  output: { item: ItemId; qty: number };
  inputs: { item: ItemId; qty: number }[];
  bench: string;
  unlock?: string;
}

export type ProviderId = string;

/**
 * Ce dont un objet fouillable ou une créature accouche : un item, sa quantité,
 * et sa probabilité quand le wiki la connaît.
 */
export interface Drop {
  item: ItemId;
  qtyMin?: number;
  qtyMax?: number;
  /** Probabilité entre 0 et 1. Seule `LootTablesItems` la donne. */
  chance?: number;
  /**
   * Chance telle que le wiki l'écrit quand elle ne se réduit pas à un
   * pourcentage : « 100% of 2 · 50% of 2-3 ». Inventer un nombre à partir de
   * cette phrase serait faux ; on la montre telle quelle.
   */
  chanceText?: string;
  /** Une créature distingue ce qu'elle lâche de ce qu'on récolte sur elle. */
  via?: "drop" | "harvest";
}

export type ProviderKind =
  | "container"
  | "destroyable"
  | "pickup"
  | "salvage"
  | "butcher"
  | "enemy";

/**
 * Ce qu'une source désigne : une caisse, un meuble, une machine, une créature.
 *
 * N'est pas un `Item` : une Manufacturing Wood Crate n'a ni recette, ni poids,
 * ni place dans l'inventaire. Elle a une image, des zones et un contenu.
 */
/**
 * Une zone où l'objet se trouve, avec ce qu'on y sait de précis.
 *
 * Les emplacements appartiennent à leur zone : mis à plat, « Vehicle Lot 07 »
 * devenait indiscernable de « Botanical Wing », à sept secteurs de distance.
 */
export interface ProviderZone {
  zone: string;
  /** Emplacements précis dans cette zone, même convention que `Source.where`. */
  where?: string[];
}

/**
 * Fiche de l'infobox {{enemy}} du wiki — tout est optionnel, la fenêtre
 * n'affiche que ce que la page sait. Les valeurs restent des chaînes : le
 * wiki écrit « Immune » ou « 80 » dans les mêmes champs.
 */
export interface EnemyStats {
  type?: string;
  codename?: string;
  origin?: string;
  identifiedBy?: string;
  weakness?: string[];
  resistance?: string[];
  immunity?: string[];
  health?: { head?: string; torso?: string; arms?: string; legs?: string };
  melee?: { damage?: string; type?: string };
  ranged?: { damage?: string; type?: string };
}

export interface Provider {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  wikiTitle?: string;
  icon?: string;
  zones: ProviderZone[];
  drops: Drop[];
  /** Présent sur les créatures dont la page porte l'infobox {{enemy}}. */
  enemy?: EnemyStats;
}

export interface Zone {
  name: string;
  order: number;
  parent?: string;
  /** Pastille ronde du wiki, fichier dans `data/icons/`. */
  icon?: string;
  /**
   * Couleur de la zone, `#rrggbb`, **extraite de sa pastille** et non choisie
   * à la main : les deux ne peuvent donc pas se contredire.
   */
  color?: string;
  /**
   * Secteurs adjacents, champs `sector1..6` de l'infobox `{{Sector}}`. Le wiki
   * les déclare parfois en sens unique (The Encroachment cite Manufacturing
   * West, pas l'inverse) : la découverte les traite bidirectionnels.
   */
  links?: string[];
}

export interface Dataset {
  items: Record<ItemId, Item>;
  recipes: Recipe[];
  zones: Zone[];
  providers: Record<ProviderId, Provider>;
}

/** Override partiel : mêmes champs, tous optionnels, `id` implicite par clé. */
export type ItemOverride = Partial<Omit<Item, "id" | "meta">>;

/**
 * « Le wiki liste cette créature dans cette zone, mais elle n'y apparaît que
 * plus tard dans la progression. » Le fait n'existe qu'en prose floue (« as
 * the player progress ») : c'est une correction humaine. Effets : les sources
 * de drop du couple deviennent `conditional` (affichées, mais ne prouvant
 * rien), et la zone quitte le provider — sa disponibilité passe par ses
 * autres zones, celles où on le rencontre vraiment d'abord.
 */
export interface DelayedPresence {
  target: string;
  zone: string;
}

export interface Overrides {
  items?: Record<ItemId, ItemOverride>;
  recipes?: Recipe[];
  zones?: Zone[];
  providers?: Record<ProviderId, Provider>;
  delayedPresence?: DelayedPresence[];
}
