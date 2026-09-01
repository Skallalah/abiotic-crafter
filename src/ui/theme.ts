/**
 * Choix du thème (§6).
 *
 * Le thème vit sur `<html data-theme>` ; tout le reste n'est que des tokens CSS
 * redéfinis sous ce sélecteur. Sa clé de stockage est **distincte de celle de
 * la session** : changer d'objet courant réécrit la session vingt fois par
 * minute, et vider la session ne doit pas faire perdre l'habillage choisi.
 */

/** Doit rester identique au littéral du script inline de `index.html`. */
const KEY = "gate-crafting-index/theme";

export const THEMES = [
  { id: "win98", label: "Windows 98" },
  { id: "gate", label: "Modern Slop" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "win98";

function isTheme(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/**
 * Thème enregistré, ou le défaut.
 *
 * Une valeur inconnue — un thème retiré depuis, un stockage bricolé — retombe
 * sur le défaut plutôt que de poser un `data-theme` mort qui ne correspondrait
 * à aucune feuille de style et laisserait l'app à moitié habillée.
 */
export function storedTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;      // stockage indisponible (navigation privée)
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // le thème tient pour la session en cours, tant pis pour la suivante
  }
}

/** Remplit le sélecteur de la barre du haut et le branche. */
export function mountThemePicker(select: HTMLSelectElement): void {
  select.replaceChildren(...THEMES.map((theme) => {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    return option;
  }));

  const current = storedTheme();
  select.value = current;
  applyTheme(current);        // remet l'attribut d'aplomb si le stockage a menti

  select.addEventListener("change", () => {
    if (isTheme(select.value)) applyTheme(select.value);
  });
}
