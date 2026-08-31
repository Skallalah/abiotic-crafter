# GATE Crafting Index — spécification v1

Mini-app locale pour explorer les recettes d'*Abiotic Factor* : arbre de craft explosable, bilan récursif des ressources, lieux de collecte par zone.

Le fichier `mockup/index.html` est la **référence visuelle et comportementale**. Il contient les tokens CSS, la structure 3 colonnes, l'arbre à boîtes pointillées, les badges Craft/Loot, et l'algorithme de bilan. Il est codé en dur sur un seul objet (Keypad Hacker). Le travail consiste à généraliser : données scrapées du wiki, code structuré, persistance des corrections manuelles.

---

## 1. Périmètre

### v1 — inclus
- Pipeline de scraping du wiki `abioticfactor.wiki.gg` → `data/scraped.json`.
- Fichier `data/overrides.json` (édité à la main) fusionné par-dessus au chargement.
- UI 3 colonnes conforme au mockup, avec tous les items craftables du jeu.
- Icônes téléchargées en local (`data/icons/`).
- Recherche, arbre explosable, bilan récursif, ordre de craft, lieux par zone.
- Persistance de l'état de session (objet courant, nœuds dépliés, zoom) — localStorage suffit.

### v1 — exclu
- Inventaire possédé / déduction du bilan (v2, voir §10).
- Recettes d'upgrade (Enhancement Bench) et troc dans l'arbre — scrapées et stockées, mais non affichées.
- Multi-langue. **Toute l'interface est en anglais**, comme les noms d'items et de zones qui viennent du wiki : mêler « casser Monitor » à « Manufacturing West » se lisait mal. Les commentaires du code, `CLAUDE.md` et `DECISIONS.md` restent en français.
- Édition des données depuis l'UI.

---

## 2. Stack

- **Front** : Vite + TypeScript, **sans framework**. Le mockup est en vanilla JS et se porte tel quel ; un framework ajouterait plus de friction que de valeur pour trois panneaux et un arbre.
- **Données** : JSON statiques servis par Vite. Pas de backend.
- **Scraper** : Python 3.11+, `requests` + `mwparserfromhell`. Exécuté à la main, jamais par l'app.
- **Tests** : Vitest pour les algorithmes (§7) ; pytest pour les parseurs du scraper.

Arborescence cible :

```
af-recipes/
  scraper/
    wiki.py              # client HTTP unique : throttle, cache, retry
    fetch_cargo.py       # étape 1
    fetch_wikitext.py    # étape 2 (zones, prose, unlock)
    parse.py             # wikitext → modèle
    build.py             # assemble data/scraped.json + data/icons/
    tests/
  data/
    scraped.json         # regénéré, ne jamais éditer
    overrides.json       # édité à la main, versionné
    icons/*.png
    raw/                 # cache brut du scraper (gitignore)
  src/
    data/  (types.ts, load.ts, merge.ts)
    core/  (tree.ts, totals.ts, zones.ts, fixtures.ts)
    ui/    (list.ts, canvas.ts, tree-view.ts, summary.ts, format.ts)
    styles/(tokens.css, app.css, fonts/)   # police servie en local (§8)
    main.ts
    **/*.test.ts                           # Vitest, à côté du code testé
  index.html
  SPEC.md
```

---

## 3. Modèle de données

Deux entités principales, **items** et **recipes**, parce qu'un item peut être obtenu de plusieurs façons et qu'une recette peut être de plusieurs natures.

```ts
type ItemId = string;          // slug du titre wiki : "Keypad_Hacker" → "keypad_hacker"

interface Item {
  id: ItemId;
  name: string;                // "Keypad Hacker"
  wikiTitle: string;           // "Keypad_Hacker" (pour reconstruire l'URL)
  icon?: string;               // nom de fichier dans data/icons/
  category: string;            // catégorie wiki : "Tools", "Resources and Sub-components", …
  description: string;         // la phrase du jeu, affichée dans la fenêtre de détail
  stack: number;
  weight?: number;
  researchMaterial?: string;   // "Tech", "Metal", "Glass", "Bio", …  → couleur de la tuile
  sources: Source[];           // façons de l'obtenir SANS le crafter
  primary?: "craft" | "loot";  // uniquement si l'item est à la fois craftable et lootable
  meta: { wikiRevision?: number; fetchedAt: string; verified: boolean };
}

interface Source {
  kind: "pickup" | "break" | "drop" | "vendor" | "salvage" | "grow";
  zone?: string;               // "Office Sector" — absent pour salvage/vendor
  where?: string[];            // emplacements précis, un par entrée ;
                               // la sous-zone est conservée en préfixe :
                               // "Level 2 › Bio Lab D."
  target?: string;             // ce qu'on casse / tue / à qui on achète : "Computer", "Security Bot"
  targetId?: ProviderId;       // le Provider que `target` désigne, quand il en a un
  from?: ItemId;               // l'item dont celui-ci dérive : démonté, cuisiné, planté
  qtyMin?: number;             // bornes du wiki ; qtyMin = 0 → obtention non garantie
  qtyMax?: number;
}

interface Recipe {
  id: string;                  // "r_<output>_<n>"
  kind: "craft" | "upgrade" | "salvage" | "trade";
  output: { item: ItemId; qty: number };
  inputs: { item: ItemId; qty: number }[];
  bench: string;               // "Crafting Bench", "Inventaire ou Crafting Bench", …
  unlock?: string;
}

type ProviderId = string;

// Ce qu'une source désigne : une caisse, un meuble, une machine, une créature.
// Ce n'est pas un Item — une Manufacturing Wood Crate n'a ni recette, ni poids,
// ni place dans l'inventaire. Elle a une image, des zones et un contenu.
interface Provider {
  id: ProviderId;
  name: string;
  kind: "container" | "destroyable" | "pickup" | "salvage" | "butcher" | "enemy";
  wikiTitle?: string;
  icon?: string;
  zones: string[];             // les mêmes que celles du bilan, relues à l'envers
  where?: string[];            // emplacements précis, même convention que Source
  drops: Drop[];
}

interface Drop {
  item: ItemId;
  qtyMin?: number;
  qtyMax?: number;
  chance?: number;             // 0–1 ; seule LootTablesItems la donne
  chanceText?: string;         // « 100% of 2 · 50% of 2-3 » quand ce n'est pas un nombre
  via?: "drop" | "harvest";    // une créature : ce qu'elle lâche vs ce qu'on récolte
}

interface Zone { name: string; order: number; parent?: string }
// `parent` porte le secteur d'un monde-portail (Flathill → Office Sector),
// lu depuis les champs portalWorld1..6 de l'infobox {{Sector}}.

interface Dataset {
  items: Record<ItemId, Item>;
  recipes: Recipe[];
  zones: Zone[];
  providers: Record<ProviderId, Provider>;
}
```

### Règles dérivées (jamais stockées)
- `isCraftable(id)` = il existe une recette `kind:"craft"` dont `output.item === id`.
- `isLootable(id)` = `sources.length > 0`.
- `isDual(id)` = les deux. Alors `primary` **doit** être renseigné. Défaut du scraper : `"loot"`, sauf si **toutes** les sources sont du salvage — démonter un objet fini n'est pas un plan d'approvisionnement — auquel cas `"craft"`.
- `primaryWay(id)` = `primary` si dual, sinon la seule voie disponible.
- `isLeaf(id)` (compté comme ressource de base dans le bilan) = `primaryWay(id) === "loot"`. Un nœud **replié** est lui aussi compté en ressource de base, sans être une feuille (§5.4).
- `isDerived(id)` = l'item a des sources et **toutes** portent un `from`. Ce sont les objets qu'on n'obtient qu'en transformant un autre ; l'UI affiche alors où trouver l'origine, pas seulement son nom.

### Fusion `overrides.json`
Même schéma, partiel. Fusion **par item, champ à champ** (`{...scraped, ...override}`), sauf `sources` et `recipes` qui sont **remplacés** entièrement si présents dans l'override. Un item présent uniquement dans overrides est ajouté. `meta.verified` vaut `true` pour tout ce qui vient d'un override.

---

## 4. Pipeline de scraping

Trois étapes, chacune écrit son brut dans `data/raw/` avant toute transformation, pour pouvoir re-parser sans re-télécharger.

### Étape 1 — Cargo
Le wiki a l'extension Cargo — elle n'apparaît **pas** dans `siteinfo&siprop=extensions`, mais `action=cargoquery` répond et `Special:CargoTables` liste 15 tables. Utilisées : `Items`, `Recipes`, `UpgradeRecipes`, `ChemistryRecipes`, `DistillRecipes`, `SoupRecipes`, `Loot`, `LootTables`, `LootTablesItems`, `ItemScrapingResults`, `Enemies`, `Objects`. Interroger :

```
GET /api.php?action=cargoquery&format=json&tables=<T>&fields=<cols>&limit=500&offset=<n>
```

Paginer par `offset`. Si les tables couvrent items + recettes + stack, l'étape 2 ne sert que pour les `sources` (souvent en prose).

`LootTables` + `LootTablesItems` décrivent le contenu des contenants — 47 tables, 216 lignes — et sont la **seule** source de `Chance` (jusqu'à 0.001). `Objects` donne la nature de chaque objet (`destroyable`, `pickup`). Les trois alimentent `providers`.

### Étape 2 — wikitext par page (complément)
Cargo ne porte **aucune zone** : toute la géographie est dans la prose. On télécharge donc les 9 pages secteur, **toutes** les pages items, et les pages des objets fouillables et des créatures, par lots de 50 via `action=query&prop=revisions` (≈36 requêtes).

Le périmètre « objets » vient de quatre listes réunies : `Objects.name`, les `_pageName` de `LootTables` hors espace `Data:`, les `_pageName` de `Enemies`, et les listes `=== Resource Nodes ===` des pages secteur — c'est la dernière qui rattrape les caisses absentes de Cargo (Office Wood Crate, Reactors Wood Crate). Les titres inexistants reviennent `missing` et sont ignorés. On y lit :
- l'`image =` de l'infobox — une caisse n'a pas de ligne dans `Items`, donc pas de champ `image` : sans ça sa fenêtre ne pourrait pas répondre à « à quoi ça ressemble ». À défaut : l'icône de l'item homonyme (Trash Bin, Toolbox sont aussi des items), puis les `{{destroyableObject}}` de la page « Destroyable Objects », vers laquelle huit caisses ne sont qu'une redirection.
- le tableau `== Drops ==`, quand il existe : onze caisses n'ont aucune ligne Cargo, et le tableau porte une chance que `Loot` ne donne jamais. Quand cette chance n'est pas un pourcentage simple (« 100% of 2<br>50% of 2-3 »), elle est conservée telle quelle dans `chanceText` — en tirer un nombre serait inventer. Les `<ref>` de la cellule sont retirés : l'un d'eux faisait 255 caractères d'explication éditoriale.
- le `== Locations ==`, avec le même parseur que pour les items.

```
GET /api.php?action=query&list=categorymembers&cmtitle=Category:Items&cmlimit=500&format=json   (+ cmcontinue)
GET /api.php?action=parse&page=<title>&prop=wikitext|revid&format=json
```
Parser avec `mwparserfromhell` :
- template infobox → `stack`, `weight`, `researchMaterial`, `icon`, `category`.
- templates de recette → `Recipe` (repérer le nom exact du template dans le wikitext de `Keypad_Hacker` avant d'écrire le parseur).
- section `== Sources ==` → `sources[]`. Heuristiques de `kind` : « breaking » → `break`, « dropped by » / « killing » → `drop`, « found in » / « located » → `pickup`, « sells » → `vendor`. Ce qui ne matche pas → `pickup` avec `where` = phrase brute, et l'item est listé dans `data/raw/needs_review.txt`.
- sous-titres de zones → un `Source` par zone. **C'est la seule géographie exhaustive du wiki** : les listes des pages secteur sont très partielles (la page du Fire Extinguisher cite quatre lieux, la liste de Manufacturing West un seul). Ces sous-titres sont le plus souvent sous `== Locations ==`, mais cinq pages les mettent sous `== Sources ==` : `zone_sections()` regarde les deux, et `parse_sources` laisse alors cette partie tranquille au lieu de l'avaler en prose.
- le corps d'une zone est une liste **à deux niveaux** : `*` désigne une sous-zone (« Level 2 », « Cloud Reactor »), `**` un emplacement précis. Chaque emplacement est une entrée de `where`, préfixée par sa sous-zone. Tout joindre en un paragraphe collait l'en-tête au premier lieu (« Level 2 Area under the Data Farm… ») et effaçait sept emplacements distincts.
- le découpage en phrases ne coupe pas après une abréviation (`Dr.`, `St.`, initiales) : « trading with [[Dr. Riggs]] » se scindait en un lien tronqué. Les templates autres que `itemIcon` sont réduits à leur dernier argument (`{{spoiler|Dr. Riggs}}` → « Dr. Riggs »).
- les liens d'une phrase de source ne sont pas choisis par le parseur : il les rend tous, et `build.py` retient le premier qui désigne un item, en écartant l'item lui-même, les zones et les établis.

### Étape 3 — icônes
```
GET /api.php?action=query&titles=File:<icon>&prop=imageinfo&iiprop=url&format=json
```
Télécharger l'original dans `data/icons/`, nom de fichier = valeur de `Item.icon`.

### Contraintes
- `User-Agent: af-recipes-scraper/1.0 (usage personnel)`. Maximum 1 requête/seconde. Retry ×3 avec backoff sur 429/5xx.
- Idempotent : une page déjà dans `data/raw/` avec le même `revid` n'est pas retéléchargée. Option `--force`.
- `build.py` termine par un **rapport** : nombre d'items, de recettes, de duals par voie, d'ingrédients qui ne résolvent vers aucun item (liens cassés), de sources dérivées résolues, d'items purement dérivés, d'items sans icône (en distinguant champ `image` absent / fichier absent du wiki / téléchargement échoué), de contenants et créatures retenus (avec contenu / avec image / avec zone), et de sources liées ou non à une fenêtre. Le build échoue si un ingrédient ne résout pas.
- Un nom de zone est normalisé contre `zones[]` ; les inconnus sont ajoutés en fin de liste avec un warning.

---

## 5. Interface

Reprendre `mockup/index.html` : mêmes tokens, mêmes classes, même structure. Ce qui suit précise le comportement et ce qui manque au mockup.

### 5.1 Layout
Trois colonnes, hauteur pleine fenêtre, colonne centrale fluide :

```
┌────────────────────────────────────────────────────────────────┐
│ GATE Crafting Index   Objet : <nom>              <aide raccourcis>│
├───────────┬────────────────────────────────────┬───────────────┤
│ recherche │ [Tout exploser][Tout replier][Recentrer]           │
│ liste des │                                    │ Bilan du dépli│
│ craftables│        arbre, pan + zoom           │ · ressources  │
│           │                                    │ · ordre craft │
│  270 px   │                                    │ · par zone    │
│           │                                    │    340 px     │
└───────────┴────────────────────────────────────┴───────────────┘
```
En dessous de 1000 px : 220 / 1fr / 300. Pas de version mobile.

### 5.2 Colonne gauche — objets craftables
- Champ de recherche, filtre à la frappe (sans accent, insensible à la casse), sur `name` **et `gearSlot`**. Le wiki nomme la tier 6 des hacking devices « Gatekey (Tier 6) » : sans le gearSlot, « hacking » ne remonterait pas toute la famille. Résultats vides → message qui reprend le terme cherché.
- Liste : icône, nom, badges, groupée par `category` avec un intertitre par groupe (le mockup ne groupe pas ; ~400 craftables l'imposent). Tri alphabétique dans chaque groupe.
- Clic → devient l'objet racine ; l'entrée prend la bordure gauche ambre.
- Raccourci `/` focus la recherche ; `Échap` la vide.

### 5.3 Colonne centrale — arbre
Principe : l'arbre descend. Un nœud est une **carte** ; cliquer sur une carte craftable la remplace par une **boîte pointillée ambre** qui contient une petite carte d'en-tête, le nom du bench, puis la rangée de ses ingrédients, reliés par des connecteurs.

Nœuds :
- **Carte craftable** (horizontale : icône, nom + badges, sous-texte, quantité). Clic = exploser / replier.
- **Carte feuille** (verticale, 92 px : icône, nom, badges, quantité). Clic = surligne l'item dans le bilan (et dans toutes ses occurrences dans l'arbre). Un item dual dont `primary = "loot"` est une feuille **mais reste explosable** ; sa boîte est titrée « recette alternative — <bench> » et n'influence pas le bilan.
- La racine porte la classe `.root` (badge de quantité plein).
- Quantité affichée = quantité **dans cette recette** (×2 Keyboard), pas le cumul.

Comportements :
- Pan par glisser sur le fond, zoom molette centré sur le curseur (0.3 → 2.5), « Recentrer » ajuste le zoom pour faire tenir l'arbre (cap à 1).
- État de dépli indexé par **chemin** (`keypad_hacker/controller/computation_brick`), pas par item : deux Computation Brick dans l'arbre se déplient indépendamment.
- « Tout exploser » déplie récursivement, y compris les recettes alternatives des duals ? **Non** : uniquement la voie principale. Les alternatives se déplient à la main.
- Changer d'objet racine réinitialise le dépli (racine dépliée seule) et recentre.
- **N'importe quel item peut devenir racine**, pas seulement les craftables : un bouton ↗ sur les cartes, les lignes du bilan et les noms d'origine l'ouvre. Le clic simple reste réservé au surlignage (§5.4). La liste de gauche, elle, ne montre que les craftables. Pour une racine non craftable, l'arbre se réduit à une carte et l'information utile est dans les liens montants.
- **Liens montants** : au-dessus de la racine, les crafts qui consomment l'objet courant, reliés par des pointillés teal — l'inverse visuel de l'arbre descendant. Cartes au format compact des feuilles, plafonnées à 12 (89 % des items en ont moins ; Box of Screws en compte 51), le reste annoncé par « + N autres ». Chaque carte porte la quantité consommée. Un clic en fait la nouvelle racine.
- Plusieurs recettes `craft` pour un même item : v1 prend la première dans l'ordre du fichier ; le nœud affiche « 1/2 » et un clic droit ou un petit bouton bascule. Le bilan suit la recette choisie.
- Cycles (A → B → A, possible via salvage mais pas via craft normalement) : le rendu s'arrête à la deuxième occurrence d'un item sur un même chemin et l'affiche comme feuille avec le sous-texte « boucle ». Test obligatoire.

### 5.4 Colonne droite — bilan
Trois sections, dans cet ordre, calculées sur **l'arbre tel qu'il est déplié**. Un nœud replié n'est pas décomposé : il compte comme un objet à se procurer entier, et apparaît dans les ressources de base avec ses moyens de l'obtenir — pour un craftable, la ligne « à fabriquer : <bench>, N composants ». Déplier ce nœud le remplace par ses composants et le fait passer en craft intermédiaire.

1. **Ressources de base** — feuilles et nœuds repliés cumulés, tri par quantité décroissante. Par ligne : icône, nom, badges, quantité, stacks (`3 stacks + 12 (64)`). Pour un dual `primary:"loot"` : ligne « ou craft : N <ingrédient> (n chacun) ». Pour un craftable **replié** : ligne « à fabriquer : <bench>, N composants » — jamais pour un dual `primary:"loot"`, qui est une feuille légitime et porte déjà sa ligne « ou craft ».
2. **Crafts intermédiaires, dans l'ordre** — tous les items craftés (racine comprise), cumulés, triés par **profondeur max décroissante** : chaque ligne apparaît après tout ce dont elle dépend. Par ligne : ×N, nom, badges, bench. Pour un dual `primary:"craft"` : ligne « ou loot : <zone> — <where> ».
3. **Où trouver, par zone** — zones dans l'ordre de `zones[].order`. Sous chaque zone : les ressources de base qui s'y trouvent avec `where` et quantité, puis en style atténué (`.optional`) les intermédiaires duals `primary:"craft"` lootables ici, avec « optional: saves crafting N <ingrédient> ». Sources sans zone (`salvage`, `vendor`) sont regroupées sous une pseudo-zone « Autres méthodes » en dernier.
   Un item **dérivé** (§3) n'a aucune zone à lui : « démonter un extincteur » ne dit pas où trouver l'extincteur. Il est donc rangé sous les zones de son **origine**, qui devient le sujet de la ligne (« ramasser Fire Extinguisher / puis démonter pour obtenir Canister »). Un item qui a déjà une zone n'hérite de rien, sinon Metal Scrap et ses six origines de salvage apparaîtraient partout. Un seul niveau de dérivation, ce qui évite aussi les cycles.

**Emplacements précis.** Sous les provenances, les entrées de `where` sont listées une par ligne, sous-zone en gras, **3 visibles** et le reste derrière le même bouton « + N more ». Le wiki en donne jusqu'à sept par zone ; joints en un pavé, ils noyaient les lignes d'obtention juste au-dessus.

**Présentation des provenances.** Partout où plusieurs manières d'obtenir un item
sont listées (lignes de zone, collecte d'une origine, alternative loot d'un
dual), **une ligne par obtention**, jamais un bloc joint par des puces qui
revient à la ligne selon la largeur du panneau. Chaque ligne commence par un
mot-clé coloré (§6). Au-delà de **5 provenances**, les suivantes sont masquées
derrière un bouton « + N more » qui les révèle au clic — l'ancienne version
tronquait silencieusement à 4, si bien qu'on ignorait qu'il en manquait.

Le surlignage (`.hl`) est synchronisé entre l'arbre et les trois sections.

### 5.5 Barre du haut
Titre, nom de l'objet courant en ambre, rappel des interactions à droite. Ajouter un lien discret vers la page wiki de l'objet courant.

### 5.6 Fenêtres de détail
**Le clic droit est la règle unique** : sur n'importe quel item (carte de l'arbre, ligne du bilan, entrée de la liste, lien dans une fenêtre) ou n'importe quel contenant, il ouvre une fenêtre **là où on a cliqué**. Ailleurs, le menu du navigateur reste intact. Le clic gauche ne change nulle part — surlignage, dépli, sélection restent ce qu'ils sont — sauf sur un nom de contenant, qui n'est pas sélectionnable comme objet courant et n'a que sa fenêtre à offrir.

Les fenêtres sont **déplaçables par leur barre de titre et refermables une à une** (WinBox.js, seule dépendance front, embarquée dans le bundle). Plusieurs cohabitent : c'est ce tri qui remplace un historique de navigation. Rouvrir un sujet déjà ouvert ramène sa fenêtre devant plutôt que d'empiler un doublon.

**Fenêtre d'un contenant ou d'une créature** : son image en grand, sa nature (« Destroyable object — break it »), ses zones, ses emplacements précis, puis son contenu — une ligne par item, du plus probable au moins probable, avec quantité et chance. Pour une créature, ce qu'elle lâche et ce qu'on récolte sur elle sont deux listes distinctes.

**Fenêtre d'un item** : image, catégorie, poids, stack, matériau de recherche, description ; où le trouver (les mêmes lignes de provenance qu'au §5.4, contenants cliquables compris) ; ses recettes avec bench, unlock et ingrédients ; ce qui le consomme ; un bouton « Observe this item » qui en fait l'objet courant.

Chaque item cité dans une fenêtre est un lien : le clic gauche le **sélectionne** comme objet courant — le même chemin que la liste de gauche — et le clic droit ouvre sa propre fenêtre.

---

## 6. Design tokens

Extraits de `mockup/index.html`, à placer dans `src/styles/tokens.css`. Ne pas en dévier sans raison.

| Token | Valeur | Rôle |
|---|---|---|
| `--bg` | `#1b2629` | fond de la scène |
| `--panel` | `#23313a` | panneaux et cartes |
| `--panel-2` | `#2b3b44` | survol, cartes feuilles |
| `--line` | `#48606a` | bordures, connecteurs |
| `--ink` / `--ink-2` | `#dfe6e2` / `#93a6ad` | texte / texte secondaire |
| `--amber` / `--amber-dim` | `#f0b641` / `#8c6a22` | accent : quantités, boîtes explosées, badge Craft |
| `--teal` | `#4fb3a9` | badge Loot, tuile Tech |
| `--red` | `#d6604a` | tuile drop (ennemi) |
| `--green` / `--glass` / `--metal` | `#8dbb62` / `#7fb7d9` / `#a9b1b4` | tuiles Bio / Glass / Metal |

Mots-clés d'obtention, colorés pour repérer la nature d'une provenance sans lire la ligne :

| Mot-clé | `Source.kind` | Token |
|---|---|---|
| `kill` | `drop` | `--red` (déjà la couleur des tuiles drop) |
| `loot` | `pickup` | `--green` |
| `break` | `break` | `--amber` |
| `salvage` | `salvage` | `--glass` |
| `grow` | `grow` | `--teal` |
| `buy` | `vendor` | `--metal` |
| `craft` | — | `--amber`, comme le badge Craft |

- Police : **Archivo** (variable, axe `wdth`). Corps 14 px à 100 % ; titres de section, badges, quantités et méta en `font-stretch: 80–85 %`. Une seule famille.
- Rayon 6 px sur les cartes, 8 px sur les boîtes explosées, 3 px sur les badges.
- Fond de scène : grille de points `radial-gradient(var(--line) 1px, transparent 1px)` au pas de 22 px.
- Couleur de tuile déterminée par `researchMaterial` (Tech→teal, Metal→metal, Glass→glass, Bio→green) ; les items avec une source `drop` → red ; l'objet racine et le gear → amber. L'icône se superpose à la tuile ; si l'image manque, la tuile montre l'abréviation (3 lettres, générée depuis le nom).
- Aucune animation d'apparition. Seule transition tolérée : `border-color` au survol des cartes craftables.
- Focus clavier visible (outline ambre 2 px).

---

## 7. Algorithmes (à couvrir par des tests)

```ts
// totals.ts
computeTotals(model: Model, root: ItemId, choice: RecipeChoice,
              rootQty = 1, expanded?: ReadonlySet<string>)
  → { base: Map<ItemId, number>; steps: Map<ItemId, number>;
      depth: Map<ItemId, number>; loops: Set<ItemId> }
```
- Parcours récursif ; `qty` se multiplie en descendant.
- `isLeaf(id)` → `base[id] += qty`, stop.
- `expanded` omis → bilan complet, indépendant de l'affichage (c'est ce que font les tests d'algorithme). Fourni → un nœud dont le chemin n'y figure pas → `base[id] += qty`, stop. Les chemins suivent **exactement** le schéma de `buildTree` : si les deux parcours divergeaient, la colonne de droite cesserait de décrire l'arbre du milieu.
- Sinon `steps[id] += qty` puis récursion sur `recipe.inputs`. Attention : `output.qty` peut être > 1 (ex. 4 munitions par craft) → nombre de crafts = `ceil(qty / output.qty)`, et les ingrédients se multiplient par ce nombre de crafts, pas par `qty`.
- `depth[id]` = profondeur max d'apparition. Ordre de craft = tri décroissant sur `depth`.
- Garde anti-cycle par chemin courant.

Cas de test minimum, avec le jeu de données du mockup :
- Keypad Hacker, Circuit Board en loot → base = {circuit_board 10, tech_scrap 6, metal_scrap 4, security_bot_cpu 3, case_fan 3, keyboard 2, desk_phone 2, glass_scrap 2, test_tube 1, bio_scrap 1} ; steps = {computation_brick 3, box_of_screws 2, glowstick 1, controller 1, lcd_screen 1, infrared_emitter 1, keypad_hacker 1}.
- Même chose avec `circuit_board.primary = "craft"` → tech_scrap 86, circuit_board absent de base, présent ×10 dans steps.
- Recette avec `output.qty = 4` et besoin de 5 → 2 crafts, ingrédients ×2.
- Cycle artificiel → termine, marque la boucle.
- Racine seule dépliée → `base` = les composants directs de la racine, `steps` = la racine seule.
- Dépli complet → bilan identique à celui obtenu sans `expanded`.
- Tout chemin produit par `buildTree` est compris par `computeTotals`.

```ts
// zones.ts
groupByZone(base, steps, ds) → ZoneGroup[]   // cf. §5.4.3
```

---

## 8. Critères d'acceptation

- [ ] `python scraper/build.py` produit `data/scraped.json` valide (schéma §3), le rapport ne liste aucun ingrédient non résolu.
- [ ] Chaque item craftable du wiki apparaît dans la liste de gauche ; la recherche « hacker » remonte les 5 Keypad Hacker, et « hacking » toute la famille, Gatekey compris (le wiki ne met pas « hacker » dans le nom de la tier 6).
- [ ] Le Keypad Hacker **entièrement déplié** donne exactement le bilan du mockup.
- [ ] Un dual sans `primary` dans scraped mais avec `primary` dans overrides utilise l'override.
- [ ] Le bilan décrit l'arbre affiché : replier un nœud le fait apparaître en ressource de base, le déplier le fait passer en craft intermédiaire et fait apparaître ses composants.
- [ ] Un arbre entièrement déplié de 60+ nœuds reste fluide au pan/zoom (pas de re-render sur `pointermove`).
- [ ] Rechargement de la page : même objet, même dépli, même vue.
- [ ] Aucune requête réseau à l'exécution de l'app (icônes, police et données locales).
- [ ] Un objet dérivé indique où trouver son origine : la Canister renvoie aux quatre secteurs où apparaît le Fire Extinguisher, pas à « Autres méthodes ».
- [ ] Les bornes `qtyMin`/`qtyMax` survivent à l'élagage des sources redondantes, y compris quand le même objet est listé dans plusieurs secteurs.
- [ ] Le clic droit sur « break Manufacturing Wood Crate » ouvre au curseur une fenêtre déplaçable montrant l'image de la caisse, ses zones, ses emplacements et son contenu avec les chances ; le menu du navigateur n'apparaît pas.
- [ ] Tout `targetId` résout vers un `Provider`, et tout `Drop.item` vers un item du dataset : aucune fenêtre ni aucun lien ne mène nulle part.
- [ ] Aucun `Provider` conservé n'est vide : chacun a au moins un contenu, une image ou une zone.
- [ ] Les zones d'un contenant ne contredisent jamais le bilan : elles en sont extraites, pas recalculées.
- [ ] Tests §7 verts.

---

## 9. Ordre de travail suggéré

1. Scraper étape 1 (Cargo) puis étape 2 pour les zones et la prose. Livrer `scraped.json` + rapport avant toute UI.
2. `types.ts`, `load.ts`, `merge.ts`, `totals.ts` + tests avec le dataset du mockup transposé au schéma.
3. Porter le mockup : `tokens.css`, `app.css`, puis les quatre modules UI. Vérifier visuellement contre `mockup/index.html` à chaque étape.
4. Ajouts hors mockup : groupement par catégorie à gauche, choix entre recettes multiples, pseudo-zone « Autres méthodes », persistance de session, lien wiki.
5. Passe sur `overrides.json` : renseigner `primary` pour tous les duals remontés par le rapport.

---

## 10. Questions ouvertes et v2

- **Inventaire possédé** (v2) : un compteur par item, déduit du bilan en cascade (posséder 1 Controller retire tout son sous-arbre). C'est la vraie réponse au « j'ai déjà 10 Circuit Boards », pas un réglage global.
- Largeur des grands arbres : le mockup compacte les feuilles, mais un tier 5 déplié dépassera 4000 px. Piste v2 : replier automatiquement les frères quand on explose un nœud, ou vue « une branche à la fois ».
- Faut-il afficher les recettes `upgrade` comme une chaîne (Keypad Hacker → Tier 2 → Tier 3) au-dessus de la racine ? Utile, mais hors v1.
- Les données du wiki sont CC BY-SA 4.0 ; les icônes sont des assets du jeu. Usage personnel local uniquement, pas de redistribution du dossier `data/icons/`.
