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
