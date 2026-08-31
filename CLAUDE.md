# Instructions pour l'agent

Lis `SPEC.md` en entier avant d'écrire du code. Ouvre `mockup/index.html` dans un navigateur : c'est la référence visuelle et comportementale, ses tokens CSS et ses classes sont à reprendre tels quels.

Ordre de travail : §9 de la spec. Le scraper et les algorithmes viennent avant l'UI ; ne commence pas l'interface tant que `data/scraped.json` n'existe pas avec un rapport propre.

Contraintes non négociables :
- Pas de framework front. Vite + TypeScript vanilla. WinBox.js (fenêtres
  déplaçables) est la seule dépendance front, embarquée dans le bundle.
- `data/scraped.json` est regénéré, jamais édité à la main. Les corrections vont dans `data/overrides.json`.
- Le scraper respecte 1 requête/seconde et met en cache dans `data/raw/`.
- Le bilan de droite décrit l'arbre affiché : un nœud replié y compte comme un objet à se procurer entier. Les deux parcours (`buildTree`, `computeTotals`) doivent produire les mêmes chemins.
- Aucune requête réseau à l'exécution de l'app.

Cargo est disponible et couvre items, recettes, stack, loot, salvage et le contenu des contenants (`LootTables` + `LootTablesItems`, seule source de `Chance`) — malgré son absence de la liste `siteinfo&siprop=extensions`. Le wikitext (§4 étape 2) sert pour ce que Cargo n'a pas : les zones (`== Locations ==` des pages item, listes des pages secteur), les sources en prose, les phrases de déblocage, et les images des caisses et créatures, qui n'ont pas de ligne dans `Items`.

`SPEC.md` est la référence d'intention, pas l'état du code : là où l'implémentation s'en écarte, `DECISIONS.md` fait foi et explique pourquoi. Pour toute ambiguïté restante, choisis l'option la plus simple, note-la dans `DECISIONS.md`, et continue.
