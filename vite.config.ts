import { defineConfig } from "vite";

export default defineConfig({
  // data/icons/ est servi tel quel à la racine du site : une icône déclarée
  // `Item_Icon_-_Tech_Scrap.png` dans scraped.json est accessible en
  // /Item_Icon_-_Tech_Scrap.png, en dev comme dans dist/. Les données JSON,
  // elles, sont importées et donc embarquées dans le bundle — aucune requête
  // réseau à l'exécution (SPEC §8).
  publicDir: "data/icons",
});
