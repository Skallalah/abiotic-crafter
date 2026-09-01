import { defineConfig } from "vite";

export default defineConfig({
  // chemins relatifs : le site vit sous /abiotic-crafter/ sur GitHub Pages,
  // et s'ouvre aussi bien en local ; les URL d'icônes passent par BASE_URL
  base: "./",
  // data/icons/ est servi tel quel à la racine du site : une icône déclarée
  // `Item_Icon_-_Tech_Scrap.png` dans scraped.json est accessible en
  // /Item_Icon_-_Tech_Scrap.png, en dev comme dans dist/. Les données JSON,
  // elles, sont importées et donc embarquées dans le bundle — aucune requête
  // réseau à l'exécution (SPEC §8).
  publicDir: "data/icons",
});
