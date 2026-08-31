import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou du niveau des tokens.
 *
 * Une couleur écrite en dur dans app.css est invisible pour les thèmes : elle
 * reste ardoise sur un habillage argent. Avant cette passe il y en avait une
 * quinzaine. Le test les interdit pour que le thème rétro ne pourrisse pas au
 * premier ajout venu. Les fichiers de `themes/` sont hors périmètre : ce sont
 * eux qui portent les littéraux.
 */

const APP_CSS = new URL("./app.css", import.meta.url);
const TOKENS_CSS = new URL("./tokens.css", import.meta.url);

/** Sans les commentaires : on n'y écrit pas de style. */
function css(url: URL): string {
  return readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const FUNCTION = /\b(?:rgba?|hsla?|color)\(/g;
const NAMED = /:\s*(?:white|black|red|green|blue|gray|grey|silver|teal|navy|orange|yellow)\b/g;

describe("niveau des tokens", () => {
  it("app.css n'écrit aucune couleur en dur", () => {
    const source = css(APP_CSS);
    expect(source.match(HEX) ?? []).toEqual([]);
    expect(source.match(FUNCTION) ?? []).toEqual([]);
    expect(source.match(NAMED) ?? []).toEqual([]);
  });

  it("chaque encre du thème par défaut vaut son aplat", () => {
    // La scission aplat/encre ne doit rien changer au rendu existant : c'est
    // ce qui la rend vérifiable plutôt que déclarative.
    const source = css(TOKENS_CSS);
    const value = (name: string) =>
      source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();

    expect(value("accent-ink")).toBe(value("accent"));
    expect(value("kw-drop")).toBe(value("red"));
    expect(value("kw-pickup")).toBe(value("green"));
    expect(value("kw-break")).toBe(value("accent"));
    expect(value("kw-salvage")).toBe(value("glass"));
    expect(value("kw-grow")).toBe(value("teal"));
    expect(value("kw-vendor")).toBe(value("metal"));
    expect(value("teal-ink")).toBe(value("teal"));
    expect(value("red-ink")).toBe(value("red"));
  });
});
