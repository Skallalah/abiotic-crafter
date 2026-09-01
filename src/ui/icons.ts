/**
 * Icônes monochromes des catégories d'objets (§5.2).
 *
 * Le wiki n'a aucune image de catégorie — `category` n'est qu'une colonne
 * texte de Cargo — donc ces pictogrammes sont dessinés main, en chemins SVG
 * 16×16. Ils se peignent en `currentColor` : le CSS pose `color:
 * var(--logo-ink)` et chaque thème choisit son encre (noir en Windows 98,
 * ambre en Modern Slop), exactement comme l'arche GATE de la barre du haut.
 * Aucune couleur en dur nulle part — le test des tokens y veille.
 */

/** La grille du bouton « All ». */
export const ALL_ICON =
  "M2 2h5.4v5.4H2zM8.6 2H14v5.4H8.6zM2 8.6h5.4V14H2zM8.6 8.6H14V14H8.6z";

/** L'ellipse de « Divers », aussi icône de secours des catégories inconnues. */
const MISC_ICON = "M2 6.6h3v2.8H2zM6.5 6.6h3v2.8h-3zM11 6.6h3v2.8h-3z";

/**
 * Un chemin par catégorie du jeu, clé = intitulé Cargo exact.
 *
 * Fish et Collectibles n'ont aucun craftable, donc pas de dessin ; une
 * catégorie inconnue retombe sur l'icône de Divers (le fourre-tout).
 */
export const CATEGORY_ICONS: Record<string, string> = {
  // marmite : couvercle à bouton, cuve à anses
  "Food and Cooking":
    "M7 1h2v2H7zM2 4h12v2H2zM3 7h10v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z",
  // plastron : encolure creusée, épaulières
  "Armor and Gear":
    "M2 2h4v1.5C6 4.9 6.9 6 8 6s2-1.1 2-2.5V2h4v4.5L12 8v6H4V8L2 6.5z",
  // clé à molette en diagonale
  "Tools":
    "M14.6 4.5a4 4 0 0 1-5.1 3.9L4 13.9 2.1 12l5.5-5.5a4 4 0 0 1 5-5.1"
    + "L10.3 3.7l2 2z",
  // balle : ogive, étui, culot
  "Weapons and Ammo":
    "M8 1C6.9 1 6 2.6 6 4.2V8h4V4.2C10 2.6 9.1 1 8 1zM6 9h4v3.5H6zM5 13.5h6V15H5z",
  // chaise de face : dossier, assise, montants et pieds
  "Furniture and Benches":
    "M3 2h10v3H3zM3 5h2v3h6V5h2v3.5H3zM3 8.5h10V10H3zM3 10h2v4H3zM11 10h2v4h-2z",
  // pousse : tige et deux feuilles
  "Farming":
    "M7 15h2v-5H7zM7 10C7 7 5 4.6 2 4.6 2 7.6 4 10 7 10zM9 10c0-3 2-5.4 "
    + "5-5.4 0 3-2 5.4-5 5.4z",
  // cube isométrique en trois faces
  "Resources and Sub-components":
    "M8 1l6 3-6 3-6-3zM2 5.4v5.1l5 3V8.4zM14 5.4v5.1l-5 3V8.4z",
  // tourelle : canon sur socle
  "Base defense":
    "M7 1h2v3h5v2H2V4h5zM4 7h8v4H4zM2 12h12v2H2z",
  // éclair
  "Light and Power": "M9.5 1L3 9h3.5L6 15l6.5-8H9z",
  // croix médicale
  "Health and Medical": "M6 2h4v4h4v4h-4v4H6v-4H2V6h4z",
  // flèche de navigation
  "Travel and Vehicles": "M14 2L2 7.2l5 1.8 1.8 5z",
  // ellipse à trois points : le tiroir à tout le reste
  "Divers": MISC_ICON,
};

/**
 * Parties du corps, pour le bloc de santé d'une créature : buste, torse,
 * bras plié, jambes. Même famille que les catégories — dessinés main,
 * peints en `currentColor`.
 */
export const BODY_ICONS = {
  head: "M8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM2 14c0-3 2.7-5 6-5s6 2 6 5z",
  torso: "M5 2h6l3 3-1.5 2L11 6v8H5V6L3.5 7 2 5z",
  arms: "M2 12h4V6c0-2 1-3 3-3h5v3H9v6a4 4 0 0 1-4 4H2z",
  legs: "M4 1h8v2H4zM4 4h3.2v11H4zM8.8 4H12v11H8.8z",
} as const;

/**
 * Types de dégâts, pour les sensibilités d'une créature (weakness /
 * resistance / immunity). Clé = intitulé du wiki. Les couleurs sont choisies
 * main — aucun visuel du wiki à extraire ici, contrairement aux zones — et
 * posées en style inline comme les couleurs de zones, jamais dans le CSS ;
 * elles doivent rester lisibles sur l'argent Windows 98 comme sur le sombre.
 */
export const DAMAGE_TYPES: Record<string, { icon: string; color: string }> = {
  "Fire": {
    color: "#d9642b",
    icon: "M8 1c3 3 5 5.5 5 8.5A5 5 0 0 1 3 9.5C3 8 4 6.5 5 5c0 1.5 1 2.5 "
      + "2 3-.5-2.5 0-5 1-7z",
  },
  "Electricity": { color: "#dfa815", icon: "M9.5 1L3 9h3.5L6 15l6.5-8H9z" },
  "Acid": { color: "#8bba26", icon: "M8 1C5.5 5 4 7.5 4 10a4 4 0 0 0 8 0c0-2.5-1.5-5-4-9z" },
  "Cold": {
    color: "#45a8dd",
    icon: "M7 1h2v14H7zM2.3 3.7l1.4-1.4 10 10-1.4 1.4zM13.7 3.7l-1.4-1.4-10 "
      + "10 1.4 1.4z",
  },
  "Holy": { color: "#8e7cc3", icon: "M6.5 1h3v4H14v3H9.5V15h-3V8H2V5h4.5z" },
  "Plasma": {
    color: "#3ec6b8",
    icon: "M8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  },
  "Laser": { color: "#d63a6a", icon: "M1 13L13 1l2 2L3 15z" },
  "Bullet": {
    color: "#8d6e63",
    icon: "M8 1C6.9 1 6 2.6 6 4.2V8h4V4.2C10 2.6 9.1 1 8 1zM6 9h4v3.5H6zM5 13.5h6V15H5z",
  },
  "Explosive": {
    color: "#c94f4f",
    icon: "M8 1l1.5 4L14 3l-2.5 3.5L15 8l-3.5 1.5L14 13l-4.5-2L8 15l-1.5-4L2 "
      + "13l2.5-3.5L1 8l3.5-1.5L2 3l4.5 2z",
  },
  "Sharp": { color: "#7f8fa6", icon: "M13 1l2 2-8 9-4 2 2-4z" },
  "Blunt": { color: "#99917f", icon: "M4 2h8v4H4zM7 6h2v8H7z" },
  "X-Ray Field": {
    color: "#46c288",
    icon: "M8 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6.5 1h3L9 6H7zM1.8 12.5l1.5-2.6L7 "
      + "11l-1.5 2.6zM14.2 12.5l-1.5-2.6L9 11l1.5 2.6z",
  },
};

/** Type inconnu du dessin (« Door Bash », « Shotgun ») : losange, encre neutre. */
export const DAMAGE_FALLBACK = {
  icon: "M8 2l6 6-6 6-6-6z",
  color: "var(--ink-2)",
};

const NS = "http://www.w3.org/2000/svg";

/** Monte le chemin en `<svg>` prêt à poser dans un bouton. */
export function svgIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const d = document.createElementNS(NS, "path");
  d.setAttribute("d", path);
  d.setAttribute("fill", "currentColor");
  svg.appendChild(d);
  return svg;
}

export function categoryIcon(category: string): SVGSVGElement {
  return svgIcon(CATEGORY_ICONS[category] ?? MISC_ICON);
}
