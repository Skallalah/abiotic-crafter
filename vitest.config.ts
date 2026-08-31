import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests d'algorithme n'ont pas besoin de DOM et sont plus rapides sans ;
    // seuls ceux qui rendent des éléments demandent jsdom.
    environment: "node",
    environmentMatchGlobs: [["src/ui/**/*.test.ts", "jsdom"]],
    include: ["src/**/*.test.ts"],
  },
});
