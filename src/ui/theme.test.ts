import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, DEFAULT_THEME, mountThemePicker, storedTheme, THEMES } from "./theme";

const KEY = "gate-crafting-index/theme";

function picker(): HTMLSelectElement {
  document.body.innerHTML = `<select id="theme"></select>`;
  return document.getElementById("theme") as HTMLSelectElement;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("thème retenu", () => {
  it("prend le défaut quand rien n'est enregistré", () => {
    expect(storedTheme()).toBe(DEFAULT_THEME);
  });

  it("retombe sur le défaut devant une valeur inconnue", () => {
    // un thème retiré depuis, ou un stockage bricolé : poser ce data-theme
    // laisserait l'app sans feuille de style correspondante
    localStorage.setItem(KEY, "amiga-workbench");
    expect(storedTheme()).toBe(DEFAULT_THEME);
  });

  it("relit ce qu'applyTheme a écrit", () => {
    applyTheme("win98");
    expect(document.documentElement.dataset.theme).toBe("win98");
    expect(localStorage.getItem(KEY)).toBe("win98");
    expect(storedTheme()).toBe("win98");
  });
});

describe("sélecteur de la barre du haut", () => {
  it("liste tous les thèmes et affiche celui en cours", () => {
    localStorage.setItem(KEY, "win98");
    const select = picker();
    mountThemePicker(select);

    expect([...select.options].map((o) => o.value)).toEqual(THEMES.map((t) => t.id));
    expect([...select.options].map((o) => o.textContent)).toEqual(THEMES.map((t) => t.label));
    expect(select.value).toBe("win98");
    expect(document.documentElement.dataset.theme).toBe("win98");
  });

  it("change le thème au choix de l'utilisateur", () => {
    const select = picker();
    mountThemePicker(select);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);

    select.value = "win98";
    select.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("win98");
    expect(localStorage.getItem(KEY)).toBe("win98");
  });

  it("remet l'attribut d'aplomb quand le stockage ment", () => {
    localStorage.setItem(KEY, "amiga-workbench");
    document.documentElement.dataset.theme = "amiga-workbench";  // le script inline
    mountThemePicker(picker());
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
  });
});
