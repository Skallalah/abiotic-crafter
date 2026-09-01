# GATE Crafting Index

Explorateur local des recettes d'*Abiotic Factor* : arbre de craft explosable,
bilan récursif des ressources, lieux de collecte par zone. **Clic droit sur
n'importe quoi** — un item, une caisse, une créature — pour une fenêtre
déplaçable montrant son image, où le trouver et ce qu'il donne. Spécification
complète dans `SPEC.md`, choix d'implémentation dans `DECISIONS.md`.

Deux habillages, au choix dans la barre du haut : « GATE terminal » et
« Windows 98 » — argent, biseaux, fonte pixel.

## Lancer l'app

```sh
npm install
npm run dev            # http://localhost:5173
npm test               # les algorithmes du §7
npm run build          # typecheck + bundle dans dist/
```

L'app ne fait aucune requête réseau : données et icônes sont locales.

## Regénérer les données

Le scraper est en Python, exécuté à la main, jamais par l'app. Il respecte une
requête par seconde et met tout en cache dans `data/raw/`.

```sh
python3 -m venv .venv && .venv/bin/pip install requests mwparserfromhell pillow pytest

.venv/bin/python scraper/fetch_cargo.py      # tables Cargo → data/raw/cargo/
.venv/bin/python scraper/fetch_wikitext.py   # secteurs, items, objets, zones → data/raw/pages/
.venv/bin/python scraper/build.py            # → data/scraped.json + data/icons/
.venv/bin/python -m pytest scraper/tests     # parseurs wikitext
```

`build.py --no-icons` saute le téléchargement des icônes (le plus long).
`--force` ignore le cache HTTP. Le build échoue si un ingrédient de recette ne
résout vers aucun item.

## Corriger une donnée

`data/scraped.json` est **regénéré, jamais édité à la main**. Les corrections
vont dans `data/overrides.json`, fusionné par-dessus au chargement : fusion champ
à champ par item, sauf `sources` qui remplace la liste entière si présente.

```json
{ "items": { "box_of_screws": { "primary": "craft" } } }
```

Les phrases de source que le parseur n'a pas su classer sont listées dans
`data/raw/needs_review.txt` après chaque build.

## Licence des données

Contenu du wiki en CC BY-SA 4.0 ; les icônes sont des assets du jeu. Usage
personnel local, pas de redistribution de `data/icons/`.

Polices embarquées : **Archivo** (OFL 1.1) et **Ark Pixel** (OFL 1.1, texte de
la licence dans `src/styles/fonts/ark-pixel.OFL.txt`).
