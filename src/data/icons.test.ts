import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dataset } from "./load";

/**
 * Garde-fou sur les icônes.
 *
 * Un item sans icône n'est pas une erreur bloquante pour le build — la tuile
 * retombe sur l'abréviation — donc rien ne le signalait bruyamment. Une
 * régression du nommage (MediaWiki met une majuscule à l'initiale des titres
 * `File:`) a ainsi laissé 239 items sans icône sans faire échouer quoi que ce
 * soit. Ce test transforme ce trou silencieux en échec rouge.
 */

const iconsDir = fileURLToPath(new URL("../../data/icons/", import.meta.url));

describe("icônes", () => {
  it("déclare une icône pour chaque item", () => {
    const sans = Object.values(dataset.items)
      .filter((item) => !item.icon)
      .map((item) => item.name);
    expect(sans).toEqual([]);
  });

  it("a le fichier sur disque pour chaque icône déclarée", () => {
    const absents = Object.values(dataset.items)
      .filter((item) => item.icon && !existsSync(iconsDir + item.icon))
      .map((item) => `${item.name} → ${item.icon}`);
    expect(absents).toEqual([]);
  });

  it("normalise les noms comme MediaWiki : initiale en majuscule", () => {
    const mauvais = Object.values(dataset.items)
      .filter((item) => item.icon && item.icon[0] !== item.icon[0]!.toUpperCase())
      .map((item) => item.icon);
    expect(mauvais).toEqual([]);
  });
});
