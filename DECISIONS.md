# Décisions

Choix faits pendant l'implémentation là où `SPEC.md` laissait une ambiguïté ou
là où le wiki ne correspondait pas à ce que la spec supposait.

## Scraping

**Cargo est disponible, malgré `siteinfo`.** L'extension Cargo n'apparaît pas
dans `action=query&meta=siteinfo&siprop=extensions`, mais `action=cargoquery`
répond et `Special:CargoTables` liste 15 tables. L'étape 1 du §4 s'applique donc
pleinement : items, recettes, stack, salvage et loot viennent tous de Cargo. Le
wikitext (§4 étape 2) ne sert plus que de complément ciblé.

**Le wikitext ne couvre que 2 besoins.** Les zones et les phrases de source ne
sont nulle part dans Cargo. On télécharge donc les 9 pages secteur et les pages
des ~1 000 items du périmètre craft, par lots de 50 via
`action=query&prop=revisions` — une vingtaine de requêtes au lieu d'un millier.

**Les recettes de chimie, de distillation et de soupe sont des `craft`.**
`ChemistryRecipes`, `DistillRecipes` et `SoupRecipes` sont des tables séparées de
`Recipes` mais décrivent la même chose : un résultat, des ingrédients, une
station. Les traiter comme `kind: "craft"` avec leur bench propre est ce qui
permet aux arbres de cuisine et de chimie de se résoudre jusqu'aux ressources de
base. Les `UpgradeRecipes` restent `kind: "upgrade"` : stockées, non affichées
(§1).

**L'ordre des zones est écrit en dur.** Le wiki n'expose l'ordre de progression
nulle part — ni dans `Template:Sector`, ni dans une catégorie. `ZONE_ORDER` dans
`scraper/build.py` le fixe à la main ; toute zone rencontrée hors de cette liste
est ajoutée en fin avec un warning.

**Les sources de salvage sont plafonnées à 6 par item.** `ItemScrapingResults`
est indexée par objet démonté ; la relire à l'envers donne jusqu'à 190
provenances pour Metal Scrap, ce qui noie la colonne de droite sans rien
apprendre. On garde les 6 meilleurs rendements (`MAX_SALVAGE`).

**Les sources redondantes sont élaguées.** La table `Loot`, les drops d'ennemis
et les listes de secteur décrivent souvent le même fait à trois niveaux de
précision (« drop » / « drop dans Office Sector » / « drop du Security Bot dans
Office Sector »). `prune_sources` ne garde que le plus précis.

**Écart au défaut `primary`.** La spec fixe `"loot"` par défaut pour un dual sans
`primary`. Exception : quand *toutes* les sources d'un item sont du salvage, le
défaut est `"craft"` — obtenir l'objet en démontant un objet fini n'est jamais un
plan d'approvisionnement. 27 items sur 113 duals sont concernés.

**Les objets démontés entrent dans le périmètre.** Un `Source` de type salvage
porte un `from: ItemId` ; si cet item n'est pas dans le dataset, l'UI affiche son
slug. Le périmètre inclut donc, en plus de la clôture des recettes, les items
cités en `from`.

**Les noms de bench restent en anglais.** Ce sont des données du wiki, pas de
l'UI (§1 : noms d'items en anglais, interface en français). « Inventory or
Crafting Bench » s'affiche tel quel.

## Application

**La recherche interroge aussi le `gearSlot`.** Le critère du §8 attend que
« hacker » remonte les 5 tiers **et** le Gatekey. Le wiki nomme la tier 6
« Gatekey (Tier 6) » : aucun « hacker » dans son nom. Les six partagent en
revanche `gearSlot = "Hacking Device"`. La recherche porte donc sur le nom plus
le gearSlot : « hacker » donne les 5 Keypad Hacker, « hacking » les 6.

**Les icônes sont servies à la racine.** `vite.config.ts` déclare
`publicDir: "data/icons"`, donc une icône `Item_Icon_-_Tech_Scrap.png` est
accessible en `/Item_Icon_-_Tech_Scrap.png`, en dev comme dans `dist/`. Les deux
JSON, eux, sont importés statiquement et embarqués dans le bundle : aucune
requête réseau à l'exécution (§8).

**La police est téléchargée en local.** Le mockup charge Archivo depuis Google
Fonts ; le sous-ensemble latin est copié dans `src/styles/fonts/`, pour la même
raison.

**`recenter()` peut descendre sous le zoom minimum de la molette.** Repris tel
quel du mockup : la molette est bornée à 0,3–2,5 mais « Recentrer » calcule le
zoom qui fait tenir l'arbre, quitte à aller plus bas (0,15 pour le Gatekey tier 6
et ses 64 nœuds sur 6 360 px).

## Liens montants (hors spec v1)

L'arbre descend de la racine vers les ressources. Les **liens montants** ajoutent
la lecture inverse au-dessus de la racine : les crafts qui consomment l'objet
courant, reliés par des pointillés teal — par opposition aux connecteurs pleins
et gris de l'arbre descendant. Un clic sur l'un d'eux en fait la nouvelle
racine, exactement comme un clic dans la liste de gauche (`setRoot`), donc avec
réinitialisation du dépli et recentrage.

**Cartes au format compact, plafonnées à 12.** 89 % des items sont consommés par
12 crafts ou moins, mais Box of Screws en compte 51. Deux garde-fous : les
cartes parentes reprennent le format vertical 92 px des feuilles plutôt que le
format horizontal des nœuds craftables, et la rangée est plafonnée à 12, le
reste annoncé par un compteur « + N autres ». Mesuré sur Box of Screws : la
scène passe de 3 609 px à 1 576 px et le zoom de « Recentrer » de 0,33 à 0,76 —
en dessous, l'arbre lui-même devenait illisible.

**Tri alphabétique.** Un tri par pertinence (quantité consommée, profondeur dans
l'arbre) serait défendable ; l'ordre alphabétique a l'avantage d'être stable et
prévisible d'un objet à l'autre.

**Un résultat n'apparaît qu'une fois.** Un item ayant plusieurs recettes qui
consomment toutes l'objet courant ne donne qu'une carte, avec la quantité de la
première recette rencontrée.

**Les recettes d'upgrade sont exclues**, comme partout ailleurs en v1 (§1).

**Limite connue.** La racine est toujours un item craftable, puisqu'on ne peut la
choisir que dans la liste de gauche ou parmi des résultats de recette. Les liens
montants d'une ressource de base — les 51 crafts qui consomment du Metal Scrap —
ne sont donc pas atteignables en v1.

## Objets dérivés (hors spec v1)

Un objet qu'on n'obtient qu'en transformant un autre était un cul-de-sac : la
Canister affichait « démonter Fire Extinguisher » et s'arrêtait là, sans dire où
trouver l'extincteur. **137 items sont dans ce cas**, dont des ingrédients très
sollicités (Fisherman's Glue dans 28 recettes, Solder dans 25).

**`Source.from` est élargi.** Le §3 le définit comme « pour salvage : l'item
démonté » ; il désigne désormais **l'item dont celui-ci dérive, quel que soit le
`kind`** — démonter, cuire, planter. C'est le seul champ que l'app consulte : la
résolution des noms reste côté scraper, qui seul connaît items, zones et établis.

**Le parseur ne choisit plus la cible.** `parse_sources` rend `targets`, tous les
liens de la phrase dans l'ordre ; `OriginResolver` (build.py) prend le premier
qui désigne vraiment un item, en écartant l'item lui-même, les 9 zones et les
établis. Prendre aveuglément le premier lien donnait « Aloe ← Repair and Salvage
Station » (l'origine réelle est le Glow Tulip, non lié dans la phrase),
« Desk Leg ← Office Sector » et, via `[[{{PAGENAME}}#Locations]]`, « Baton ←
Baton ». Un lien désignant une zone alimente `Source.zone`.

Les **établis ne sont écartés que dans la prose** : « Crafting Bench » est aussi
un item du jeu, et `ItemScrapingResults` dit à juste titre qu'en le démontant on
récupère une Power Supply Unit.

**Le placement indirect se fait côté app, pas dans le JSON.** `groupByZone` range
un dérivé sous les zones de son origine, marqué `via`. Écrire cette zone dans
`scraped.json` serait un mensonge : ce n'est pas là qu'on trouve la Canister,
c'est là qu'on trouve l'extincteur. Le marqueur `via` garde la nuance à
l'affichage. Un item qui a déjà une zone à lui n'hérite de rien — sinon Metal
Scrap et ses six origines de salvage apparaîtraient partout.

**Un seul niveau de dérivation.** La mesure sur les données réelles ne gagne rien
au-delà, et s'arrêter là évite le cycle Anteverse Wheat Seed ↔ Anteverse Wheat.

**Toutes les pages items sont téléchargées.** `fetch_wikitext.py` se limitait à
la clôture des recettes ; 47 items du dataset n'avaient donc aucune page, dont 39
origines de dérivés — sans aucune source, Fire Extinguisher compris. Les lots de
50 ramènent les 1 622 pages à 33 requêtes : le ciblage ne valait plus son coût.
Effet de bord mesuré : les lootables passent de 419 à 532.

**Le clic simple reste le surlignage.** Le §5.3 le réserve au surlignage et le
§5.4 exige qu'il soit synchronisé arbre ↔ bilan. Ouvrir un objet passe donc par
un bouton ↗ dédié, apparaissant au survol des cartes, et par les noms d'origine
cliquables. En contrepartie **n'importe quel objet peut devenir racine**, pas
seulement les craftables : c'est ce qui rend enfin visibles les 3 crafts qui
consomment la Canister. La liste de gauche reste limitée aux craftables (§5.2),
et le filtre de recherche n'est vidé que pour un objet qui y figure.

**Deux bugs de données corrigés au passage.** Cargo échappe le paramètre `name` :
25 items s'affichaient « Fisherman&#39;s Glue » (`html.unescape`, le `_pageName`
étant propre, les `id` ne bougent pas). Et le champ `image` du Cupboard contient
un wikilien complet `[[File:Cupboard1.png]]` au lieu d'un nom de fichier.

### Section `== Locations ==` des pages item

Oubli de la première implémentation : le §4 étape 2 demande « section
`== Locations ==` avec sous-titres de zones → un `Source` par zone », et seules
les listes des 9 pages secteur étaient lues. Or celles-ci sont très partielles :
la page du Fire Extinguisher cite **quatre** lieux (Manufacturing West, Cascade
Laboratories, The Train, Fragments) quand la liste de Manufacturing West n'en
connaissait qu'un. `parse_locations` lit désormais ces sections sur les 1 622
pages : **98 items y gagnent leur première zone**.

**L'ordre des zones devient hiérarchique.** Les pages item citent des lieux hors
des 9 secteurs (Flathill, The Train, Dunkeltaler Forest…). Plutôt que de les
empiler en fin de liste, `build_zones` lit les champs `portalWorld1..6` de
l'infobox de chaque secteur et insère chaque monde-portail juste après son
parent, en renseignant `Zone.parent` du §3. Seuls 5 sous-lieux non déclarés
(Power Services, Temple of Stone…) restent ajoutés en fin avec un warning.

### Bornes de quantité des sources

`Source.qty` du §3 est remplacé par **`qtyMin` / `qtyMax`**. Le wiki donne les
deux (`Loot.amountMin/Max`, `ItemScrapingResults.amountMin/Max`) et `amountMin`
vaut 0 sur **46 des 116 lignes de `Loot`** : une Manufacturing Wood Crate donne
0 à 3 Box of Screws. Ne garder que le maximum effaçait du dataset la différence
entre une source fiable et un coup de chance. 501 sources portent désormais leurs
bornes, dont 58 non garanties.

L'UI ne change pas : elle n'affiche que `qtyMax`, comme avant.

**`prune_sources` perdait ces quantités.** L'élagage des sources redondantes garde
la variante la plus précise — issue du croisement page secteur × table `Loot`,
qui ne porte pas de quantité — et jetait la variante globale, qui elle en avait
une. Les bornes sont maintenant reportées sur **toutes** les sources couvrantes :
une même caisse listée dans deux secteurs les conserve dans les deux, alors qu'un
premier jet ne les transférait qu'à la première. `where` n'est délibérément pas
reporté, sous peine de recoller une phrase vague sur une source localisée.

**Reste inutilisé :** `LootTablesItems.Chance` (216 lignes, valeurs jusqu'à 0,01)
n'est lu par personne — la table `LootTables` n'est pas encore câblée.

## Le bilan suit le dépli (renversement du §8)

**Écart assumé à une contrainte écrite.** Le §8 pose « Exploser / replier ne
change jamais le bilan » et `CLAUDE.md` la range parmi les contraintes non
négociables. Elle est levée sur demande explicite : un nœud replié n'est plus
décomposé, il compte comme **un objet à se procurer entier**, avec ses moyens de
l'obtenir. Sur le hacker tier 2, tier 1 non déplié apparaît dans les requis
comme un objet à récupérer plutôt que comme ses onze composants.

`SPEC.md` §8 et la contrainte de `CLAUDE.md` sont donc désormais fausses ; elles
n'ont pas été réécrites d'office.

**`computeTotals` prend un `expanded` optionnel.** Omis, il rend le bilan complet
— c'est ce que font les tests d'algorithme, qui n'ont pas à connaître l'UI.
Fourni, il ne descend que dans les chemins dépliés.

**Les deux parcours doivent décider pareil.** `computeTotals` reconstruit les
mêmes chemins que `buildTree` (`keypad_hacker/controller/computation_brick`) ;
s'ils divergeaient, la colonne de droite cesserait de décrire l'arbre du milieu.
Un test vérifie que tout chemin produit par l'arbre est bien compris du bilan,
et qu'un dépli complet redonne exactement le bilan d'avant.

**Une feuille légitime n'est pas un nœud replié.** La ligne « à fabriquer :
<bench>, N composants » n'apparaît que pour un craftable arrivé dans les
ressources de base **parce qu'il est replié**. Un dual `primary: loot` reste une
feuille : sa recette est déjà présentée par la ligne « ou craft », la doubler
d'un « à fabriquer » se contredisait.

Le titre de la colonne devient « Bilan du dépli courant » : « Bilan complet »
n'était plus vrai.

## Provenances : une ligne par obtention, en anglais

Les provenances étaient jointes par des puces médianes en un bloc qui revenait à
la ligne selon la largeur du panneau (`casser Monitor · casser Printer · tuer Lab
Rat`) : on ne distinguait plus les méthodes, et la liste était **silencieusement
tronquée à 4**. Désormais une `<li>` par obtention, mot-clé coloré en tête.

**Toute l'interface passe en anglais.** Les noms d'items, de zones et les phrases
`where` viennent du wiki et sont anglais ; mêler « casser Monitor » à
« Manufacturing West » se lisait mal. Le §1 de `SPEC.md` est corrigé en
conséquence. Le dépôt lui-même — commentaires, noms de tests, `CLAUDE.md`,
`DECISIONS.md` — reste en français : la demande portait sur l'interface.

**Couleurs prises dans les tokens du §6, sans en ajouter.** `kill` en rouge et
`loot` en vert étaient demandés ; le rouge coïncide avec la couleur que le §6
donne déjà aux tuiles drop. `buy` hérite du token le plus discret (`--metal`)
parce que c'est la nature la plus rare — 41 sources sur 2 023.

**Plafond à 5, révélable.** 93 % des couples (item, zone) ont 4 provenances ou
moins ; le plafond ne se déclenche que sur 79 cas sur 1 177, presque tous dans la
pseudo-zone « Other methods » (Bio Scrap y en cumule 24). Le bouton « + N more »
les affiche toutes et disparaît. L'état est volontairement local au DOM : un
re-render le remet replié, comportement attendu d'un simple dépliant.

**`sourceLabel` reste une fonction texte** à côté de `sourceLine`, qui rend du
DOM : les infobulles et les tests ont besoin d'une chaîne, et rendre du DOM là
où l'on veut du texte compliquerait pour rien.

**Vitest gagne jsdom, pour un seul dossier.** `environmentMatchGlobs` limite
jsdom à `src/ui/**/*.test.ts` ; les tests d'algorithme restent en environnement
`node`, plus rapide.

## Emplacements : restituer la liste que le wiki structure

Le texte `where` du Hose formait un pavé de 640 caractères qui noyait les lignes
d'obtention. Ce n'était pas un cas isolé : **154 des 383 entrées de zone issues
des sections de localisation contenaient plusieurs puces**, toutes aplaties par
`" ".join(details)`, et 62 avaient en plus une hiérarchie perdue.

**La structure existait dans la source.** Le wiki liste sur deux niveaux : `*`
désigne une sous-zone (« Level 2 », « Cloud Reactor »), `**` un emplacement
précis. D'où le texte qui s'ouvrait sur « Level 2 Area under the Data Farm… » :
l'en-tête collé au premier lieu. `Source.where` devient donc **`string[]`**, une
entrée par emplacement, la sous-zone conservée en préfixe (`Level 2 › Bio Lab
D.`). Écart au §3 du même ordre que `qty` → `qtyMin`/`qtyMax`.

**Trois bugs voisins, trouvés en mesurant :**

`zone_sections()` cherche les sous-titres de zone sous `== Locations ==` **et**
sous `== Sources ==`. Cinq pages (Cooking Pot, Frying Pan, Nachos, Canned Peas,
Military M.R.E.) utilisent la seconde forme : le parseur de prose avalait le bloc
et affichait « ===Office Sector=== Level 2 * Kitchen » à l'écran, en ne retenant
qu'une zone sur sept. Cooking Pot en a désormais huit.

Le découpage en phrases coupait après une abréviation : « trading with
[[Dr. Riggs]] » devenait « …trading with [[Dr. », lien tronqué compris. Des
lookbehind de longueur fixe couvrent `Dr.`, `St.`, `Sgt.` et les initiales
isolées (`M.O.P.`).

`strip_links` ne connaissait qu'`itemIcon` ; `{{spoiler|Dr. Riggs}}` passait tel
quel. Tout template est maintenant réduit à son dernier argument.

**Effet de bord vérifié :** les lootables passent de 533 à 520. Ce n'est pas une
perte mais une correction — les 13 items concernés sont les armures à initiales
(A.E.G.I.S., F.O.R.G.E., A.T.O.M.S.). Leur unique source était un fragment
fabriqué par le découpage : « A.E.G.I.S. Helmet can only be obtained through
Upgrading. » se scindait après « A.E.G.I.S. », et ce fragment de 10 caractères,
au-dessus du seuil et sans mot-clé de rejet, devenait une source fantôme. Les
« phrases à relire » baissent de 332 à 315 pour la même raison.

**Résultat mesuré :** plus aucun balisage wiki dans les données (16 textes
fautifs avant), le plus long emplacement passe de 977 à 386 caractères, et 1 286
emplacements sont désormais distincts.

**Affichage : réutilisation du dépliant.** Aucun nouveau vocabulaire visuel — le
`sourceList` déjà en place gagne un plafond paramétrable, 5 pour les provenances
et 3 pour les emplacements, plus verbeux.


## Fenêtres de détail : contenants, créatures, items

Le bilan ne disait qu'un nom — « break Manufacturing Wood Crate », « kill Pest ».
On ne savait ni à quoi la caisse ressemble, ni ce qu'elle contient d'autre, ni si
elle vaut le détour. Trois tables Cargo portaient déjà la réponse et n'étaient
jamais lues : `LootTables` + `LootTablesItems` (47 tables, 216 lignes, **seule
source de `Chance`**, jusqu'à 0.001) et `Objects` (la nature de chaque objet).

### Une entité nouvelle plutôt qu'un item bricolé
`Provider` n'est pas un `Item` : une Manufacturing Wood Crate n'a ni recette, ni
poids, ni place dans l'inventaire. Elle a une image, des zones et un contenu. La
mettre dans `items` aurait pollué la liste de gauche, le bilan et les totaux.

### Les zones ne sont pas recalculées
Elles sont extraites de l'index des sources d'items, relu à l'envers : une source
`{kind: break, target: X, zone: Z}` situe X en Z. Une fenêtre ne peut donc pas
contredire le bilan qui l'a ouverte. Le `== Locations ==` de la page de l'objet
vient s'y ajouter, jamais s'y substituer.

### `targetId` est posé par le scraper
Rapprocher `target` d'un provider par son nom au runtime confondrait l'item
« Toolbox » et le contenant « Toolbox », qui n'ont ni le même contenu ni la même
image. Le scraper, lui, sait de quelle table vient la ligne. 1 034 sources sont
liées ; 546 cibles restent sans fenêtre — du bruit de prose (« Fishing »,
« Traits ») ou des objets que le wiki ne documente pas. Un lien n'est posé que
là où il mène quelque part.

### L'image a coûté un élargissement du scraping
`data/icons/` ne contenait que des icônes d'items ; une caisse n'a pas de ligne
dans `Items`, donc pas de champ `image`. L'étape 2 télécharge désormais aussi les
pages d'objets et de créatures (+157 titres, **3 requêtes**). Trois sources
d'image en cascade, dans cet ordre : l'`image =` de l'infobox, l'icône de l'item
homonyme (Trash Bin, Toolbox, Office Chair sont aussi des items), puis les
`{{destroyableObject}}` de la page « Destroyable Objects » — huit caisses, dont
la Wooden Crate elle-même, n'ont pour page qu'une redirection vers cette liste.
Résultat : 157 des 164 contenants ont une image. Les sept restants sont les sets
génériques de `Data:ContainerLoot` (Filing Cabinet, Office Locker…), qui n'ont ni
page ni item ; leur fenêtre montre quand même leur contenu.

### Le tableau `== Drops ==` complète Cargo, il ne le corrige pas
Onze caisses (Office Wood Crate, Reactors Wood Crate…) n'ont aucune ligne Cargo :
leur contenu n'existe que dans le tableau de leur page. Ce tableau porte en outre
une chance que `Loot` ne donne jamais — mais parfois sous forme de phrase
(« 100% of 2<br>50% of 2-3 »). En tirer un nombre serait inventer : elle est
conservée telle quelle dans `chanceText`. Les `<ref>` de la cellule sont retirés,
l'un d'eux faisant 255 caractères d'explication éditoriale. Fusion par (objet,
item), première valeur gagnante — donc Cargo, structuré, avant la prose. Le
dédoublonnage n'est pas cosmétique : `LootTables` déclare le set `Refrigerator`
sur deux pages, ce qui faisait arriver ses quatre lignes en double.

### Le contenu des caisses entre dans le périmètre du dataset
Une fenêtre lie chaque item de son contenu ; un lien vers un item absent
n'irait nulle part. `scope` gagne donc les items des contenus : 1 100 → 1 153
items, 520 → 573 lootables. Ce n'est pas une régression mais l'entrée dans le
dataset d'items réels (Money, Magazines, Stapler) que rien n'y amenait.

### Le clic droit, règle unique
Décidé avec l'utilisateur : le clic droit ouvre une fenêtre sur ce qu'il désigne,
partout — item ou contenant. Le clic gauche ne change nulle part, sauf sur un nom
de contenant, qui n'est pas sélectionnable comme objet courant et n'a que sa
fenêtre à offrir. Ailleurs, le menu du navigateur reste intact.

### WinBox.js plutôt qu'un `<dialog>` modal
Première version : un `<dialog>` modal centré, avec une pile d'historique et un
bouton « ← back ». Rejetée par l'utilisateur — il veut des fenêtres qui
apparaissent **au curseur**, déplaçables, refermables une à une, et c'est ce tri
qui remplace la navigation arrière. WinBox.js (13 ko, zéro dépendance, images en
`data:` inlinées) fournit la barre de titre, le déplacement et le ✕ ; les
boutons réduire/agrandir/plein écran sont masqués par `no-min no-max no-full`.
Seule dépendance front du projet, embarquée dans le bundle : la contrainte
« aucune requête réseau à l'exécution » tient.

**Vérifié au navigateur :** fenêtre ouverte au point du clic (`left` = clientX +
12), déplacement par la barre de titre effectif, deux fenêtres cohabitant,
rouvrir un sujet ne duplique pas.

### Enrouler plutôt que minimiser
Le double-clic sur la barre de titre réduit la fenêtre à son seul titre, **sans
la déplacer**. WinBox offre bien un `minimize()`, mais il empile les fenêtres en
bas de l'écran : on perdrait l'endroit où on les avait posées, alors que c'est
justement la disposition qu'on construit en les baladant. L'implémentation est
une classe CSS, pas un appel à `resize()` — qui serait bloqué par le
`minheight: 160` des fenêtres — et l'animation vient de la transition de WinBox.
Son double-clic natif agrandit la fenêtre, mais `no-max` le désactive : la voie
était libre.


## Thèmes : le niveau des tokens avant l'habillage

L'app n'avait qu'un habillage. Ajouter un thème rétro aurait pu se faire en
empilant des surcharges, mais `app.css` contenait encore **une quinzaine de
couleurs en dur** (`#10191b`, `#2f6e68`, `#6f8f92`, deux `rgba` ambre, un
`#fff`) : chacune serait restée ardoise sur un habillage clair. La première
moitié du travail a donc été de les faire toutes passer par un token, et un test
interdit désormais toute couleur littérale dans `app.css`.

### Aplats et encres
Le point non évident : `--amber`, `--teal`, `--red`, `--metal`, `--glass`,
`--green` servaient **à deux choses** — remplir une pastille d'icône, avec du
texte sombre par-dessus, et colorer du texte sur un panneau. Sur l'ardoise, une
seule valeur suffit aux deux. Sur l'argent `#c0c0c0`, un `#f0b641` reste lisible
en aplat et devient illisible en texte.

D'où la scission en deux familles : les **aplats** (`--accent`, `--teal`…) ne
bougent pas d'un thème à l'autre, ce sont eux qui portent le sens des matériaux ;
les **encres** (`--accent-ink`, `--kw-*`, `--teal-ink`, `--red-ink`)
s'assombrissent. Dans le thème par défaut chaque encre vaut exactement son
aplat, et **le test le vérifie** : la scission ne change pas un pixel de
l'existant, ce qui la rend démontrable plutôt que déclarative.

### La police a dicté deux choix
Le rendu rétro tient d'abord à la fonte. Les clones fidèles de MS Sans Serif
(W95FA notamment) sont « gratuits pour usage personnel » — ce qui n'autorise pas
la redistribution, or le dépôt est public. **Ark Pixel 12 px proportionnel, SIL
OFL 1.1**, sous-ensemble latin réduit avec `fonttools` : 7,7 ko, licence claire,
texte de la licence à côté du fichier.

Deux conséquences :

- **Le séparateur de sous-zone change de glyphe.** Ark Pixel n'a pas de U+203A
  (`›`). Un caractère absent se comble par une autre fonte au milieu de la ligne
  et ça se voit tout de suite. Plutôt que de toucher la donnée, `spotLine` ne
  recopie plus le chevron : il pose un `<span class="sep">` dont le glyphe vient
  du token `--spot-sep` — c'est de la typographie, pas de la donnée. Le thème
  rétro y met `»`, qui existe. La table `cmap` de la fonte, pas une mesure de
  largeur, sert de vérification : deux caractères peuvent avoir la même largeur
  dans deux fontes différentes, la sonde par mesure donne des faux positifs.
- **Les tailles de police sont ramenées à une seule.** Une fonte pixel n'est
  nette qu'à sa taille de dessin ; `app.css` en étale huit entre 10 et 16 px.
  Le thème rétro les force toutes à 12 px, avec `letter-spacing: 0` et
  `font-stretch: normal` — les axes de largeur d'Archivo n'existent pas ici.

### Contraste mesuré, pas estimé
Les premières encres rétro tombaient entre 3,79 et 4,19 sur l'argent. Mesure
scriptée dans le navigateur, assombrissement à luminance constante de teinte,
re-mesure : **toutes au-dessus de 4,5:1**, la plus basse à 4,60.

### WinBox suit sans effort
La classe des fenêtres passe de `gate` à `app` — `gate` est devenu un nom de
thème. Comme les fenêtres sont accrochées à `document.body` et que le thème vit
sur `<html>`, une fenêtre **déjà ouverte** change d'habillage avec le reste :
vérifié, dégradé ambre → barre ardoise sans la rouvrir.


### Après essai : gris plus clair, liens teal
Premier jet à `#c0c0c0`, l'argent canonique : les liens ambre s'y noyaient. Deux
retouches, demandées après coup et vérifiées à la mesure :

- l'argent passe à **`#d4d0c8`**, le gris des thèmes classiques de Windows 2000.
  Tout le texte y gagne près d'un point de contraste — les encres passent de
  4,6 à 5,45 — sans quitter l'époque ;
- le **lien devient un rôle de token à part entière**, `--link` et `--link-2`.
  Ils valent l'ambre et le teal existants dans le thème par défaut, donc rien n'y
  change ; le rétro met le teal `#0f5f68` sur les liens vers un item et le bleu
  `#1a4f8a` sur ceux vers un contenant. Deux couleurs plutôt qu'une : un clic
  gauche sur l'un sélectionne l'objet, sur l'autre il ouvre une fenêtre, et rien
  d'autre ne le disait.


## « Où le trouver » se lit par lieu, pas en deux listes

La fenêtre du Computer affichait ses sept secteurs sur une ligne, puis ses douze
emplacements à la file en dessous. « In the Vehicle Lot 07 » suivait « In the
Botanical Wing » sans que rien ne dise lequel appartenait à quel secteur — sept
secteurs d'écart. Le wikitext, lui, est parfaitement structuré : une section par
zone, ses puces dessous. C'est `build_providers` qui aplatissait, en concaténant
les `where` de toutes les zones dans une seule liste.

`Provider.zones` passe donc de `string[]` à `{ zone, where? }[]` : une zone porte
ses propres emplacements. La fenêtre n'a plus qu'une section « Where to find
it », un nom de lieu en gras et sous lui ce qu'on y sait. Une zone sans
emplacement connu reste affichée — le secteur est déjà une information.

La fenêtre d'un **item** avait le même défaut, et le même remède : ses sources
sont groupées par zone, dans l'ordre de progression du bilan, avec « Other
methods » en dernier. Les deux fenêtres et la colonne de droite racontent
désormais la même géographie.

### Le séparateur de sous-zone redevient du texte
Il était rendu par un `::before` tirant son glyphe du token `--spot-sep`, pour
qu'un thème puisse en changer. Correct à l'écran, mais **tout ce qu'on copiait
depuis la page revenait collé** — « Level 2Data Farms. », qui est exactement la
forme sous laquelle le problème m'a été rapporté. Le séparateur redevient du
vrai texte, ` » `, qui existe dans les deux fontes ; le token disparaît. Une
mesure de largeur de glyphe ne suffisait pas à trancher : c'est la table `cmap`
d'Ark Pixel qui dit que `»` est présent et `›` absent.


## Une pastille et une couleur par zone, toutes deux prises au wiki

Le wiki a déjà choisi : chaque secteur et chaque monde-portail a sa pastille
ronde. Les inventer aurait été à la fois du travail et un risque de
contradiction avec l'image affichée juste à côté.

### Où est la ronde
`{{Sector}}` met la pastille directement dans son `image =`. `{{PortalWorld}}`,
lui, y met une capture carrée et pose la ronde juste après le modèle, en
`[[File:Icon Flathill.png|128px|left]]`. Le point commun est le **préfixe
« Icon » du nom de fichier** : `parse_zone_icon` le cherche dans l'infobox comme
dans les liens de la page, et retombe sur l'image de l'infobox quand aucune
n'est préfixée — trois zones sont dans ce cas, elles auront une image carrée
que le CSS arrondit.

Les titres de zones à télécharger viennent de deux endroits : les mondes-portails
sont déclarés par l'infobox de leur secteur, et le reste — Divarication, North
Pole, Temple of Stone — n'existe que comme sous-titre d'un `== Locations ==`.
On relit donc les pages items déjà en cache plutôt que de coder ces noms en dur.
Une requête de plus.

### Extraire la couleur : le pixel majoritaire est un piège
Ces pastilles sont des PNG tramés. Leur pixel le plus fréquent est le **noir de
leur contour**, et le tramage éclate chaque teinte en voisines : le orange de
Manufacturing West existe en `#ffa610` et en `#ad5500` sans qu'aucun ne domine.

`dominant_color` isole donc les pixels colorés (saturation ≥ 0,35), en fait un
histogramme de teintes sur 36 secteurs de 10°, garde le secteur le plus lourd et
ses deux voisins, puis moyenne leurs RGB — ce qui recompose ce que le tramage
avait dispersé. Une icône sans couleur (Flathill l'est vraiment) tombe sur une
moyenne des tons moyens, contour noir et reflets blancs écartés.

Un détail a coûté un test : j'avais plafonné la valeur à 0,97 pour écarter le
blanc. Mais le blanc s'écarte par sa **saturation**, et un orange vif est
légitimement à v = 1 — le plafond jetait la moitié de la teinte cherchée.

Résultat : 28 zones sur 31 ont pastille et couleur. Office Sector `#347caa`,
Manufacturing West `#c57c1b`, Shadowgate `#67328c`, Reactors `#3fa643`.

### L'usage : un filet, pas du texte
La couleur sert de **filet vertical** au bloc de zone et de cerclage à la
pastille, jamais de couleur de texte : elle vient d'une image et rien ne garantit
son contraste sur les deux thèmes. Un filet, lui, n'a qu'à être visible.

`pillow` rejoint les dépendances du scraper.


## Découverte des zones : la sémantique a été mesurée avant d'être écrite

Filtrer « tout ce qui est lié aux zones découvertes » semble simple jusqu'aux
items dont la donnée ne dit pas où ils sont : 101 n'ont que des sources sans
zone, 92 n'ont ni source ni recette. Trois règles ont été mesurées sur les
vraies données avant de choisir :

- **stricte** (prouver un chemin) : même toutes zones cochées, 82 craftables
  disparaissaient — leurs chaînes `from` aboutissent sur un poisson ou une
  créature dont la prose n'a pas de zone ;
- **stricte + providers** : le Gutfish Eel et la ruche connaissent leurs zones,
  et leurs `drops` nomment ce qu'on en tire — suivre les contenants referme la
  plupart des chaînes ; il restait 54 craftables bloqués par 17 ingrédients
  terminaux (œufs, riz, marchands sans lieu) ;
- **retenue** : stricte + providers, **plus une clôture** — ce que la donnée ne
  sait localiser nulle part (∉ disponible(toutes zones), précalculé une fois
  par dataset) n'est jamais caché. Les deux invariants — *désactivé = app
  entière*, *tout coché = app entière* — tiennent alors **par construction**,
  et sont testés sur les vraies données. Office seul → ~350 craftables sur 597.

Le point fixe traverse : zone directe, chaîne `from`, contenant visé
(`targetId`), contenant qui lâche (`drops`), recette complète. Un contenant
sans zone déclarée existe partout (les casiers génériques). Un marchand sans
lieu ne bloque rien : inconnu n'est pas spoiler.

### Le bug trouvé par la mesure
`OriginResolver` ne connaissait que les 9 secteurs de `ZONE_ORDER` : « found in
[[Rise]] » rangeait Rise en **cible** au lieu de zone, et Egg restait sans
géographie. Il reçoit désormais secteurs + mondes-portails ; un test verrouille
qu'aucune source n'a plus une zone dans `target`.

### La frontière vient du wiki, lue dans les deux sens
`sector1..6` de l'infobox {{Sector}} — jamais parsé jusqu'ici — donne le graphe
d'adjacence ; il est parfois déclaré en sens unique (The Encroachment cite
Manufacturing West, pas l'inverse), donc lu bidirectionnel. Mondes-portails par
`parent`, dans les deux sens aussi. Les cinq zones que rien ne relie sont
toujours proposées sous « Uncharted » : les cacher à jamais serait pire
qu'avouer que la donnée ne sait pas.

### Ce qui se floute et ce qui se filtre
Décidé avec l'utilisateur : le voile est un **flou révélé au survol** — rien ne
disparaît d'une recette, on sait qu'il faut *quelque chose*, pas quoi. La racine
de l'arbre n'est jamais floutée : l'ouvrir est déjà une révélation délibérée.
Les listes, elles, filtrent vraiment (liste de gauche, groupes de zones du
bilan, blocs de zones des fenêtres — qui ne donnent que le **compte** des zones
tues). `computeTotals` n'est pas touché : le bilan chiffre la recette, la
découverte n'en change pas les besoins. Décidé aussi : suivi **actif par
défaut** (Office Sector coché), et décocher une zone ne cascade pas — revenir
en arrière est un droit, l'app ne décide pas à la place du joueur.


### Trois fuites, trouvées à l'usage et refermées
Signalé avec Office + Flathill + Far Garden : l'Energy Pistol restait
craftable, Capacitor et Night Essence en clair. Trace faite, trois règles
étaient trop généreuses :

- **« un provider sans zone existe partout »** couvrait aussi les créatures :
  Capacitor passait par un Giant Power Leech jamais localisé, Military
  Electronics par les soldats de l'Order, Night Essence par un poisson. Le
  bénéfice du doute est restreint au **mobilier générique** (container, pickup,
  salvage) — un casier existe partout, une créature vit quelque part ;
- **« source sans géographie ⇒ disponible »** attrapait les cibles nommées mais
  jamais résolues (« kill Order ») : quelqu'un qu'on nomme n'est pas un lieu
  inconnu, c'est un lieu qu'on ne sait pas vérifier — la source ne prouve
  plus rien ;
- le point fixe ignorait les **UpgradeRecipes** : les armures A.E.G.I.S.
  passaient « jamais localisables » donc toujours visibles, au lieu de suivre
  leurs ingrédients.

Après correction : Office seul → 238 craftables sur 597 (contre 348), les cinq
items du signalement cachés avec les trois zones, l'invariant « toutes zones =
tout » intact — la clôture recalcule sa base avec **les mêmes règles** que le
filtre, sinon elle ne mesure pas ce qu'elle prétend. Le cas rapporté est un
test de non-régression sur les vraies données ; 112 items restent « jamais
localisables », et un craft gardé visible par cette clôture montre ses
ingrédients inatteignables floutés — l'app avoue ce qui manque.


### « Pourquoi je vois encore Carapace Helm ? » — la clôture n'était pas le problème
Le Helm restait visible parce que sa chaîne mourait *même toutes zones
cochées* : la clôture le protégeait à bon droit — mais elle mourait pour de
mauvaises raisons, des trous de données comblables. Trois gisements ouverts :

- **les infobox des mondes-portails** : mêmes champs `enemy1..12` et `item1..12`
  que les secteurs, jamais croisés. Flathill déclare Symphonist et Power Cell,
  le Far Garden son Exor Monk. 161 sources d'items gagnées, et l'étape 4 lit
  désormais toutes les pages de zones, pas les 9 secteurs ;
- **les pages des PNJ marchands** : « trading with [[The Blacksmith]] » n'a de
  géographie que sur la page du PNJ ({{Person}}, `appearance1..N` ; à défaut,
  premier lien de la page désignant une zone connue — le Quantum Exchanger est
  une machine). Les cibles des phrases de vente sont relues des pages en cache,
  pas codées en dur : 20 pages, 37 ventes localisées ;
- **les lieux en prose des créatures** : la Peccary Sow nomme trois zones en
  simples puces sous `== Locations ==`, sans sous-titres — invisible pour
  `parse_locations`. Un repli `zone_mentions` cherche les noms de zones connus
  dans la section, casse respectée (« Rise » ne matche pas « surprise »).

Effet mesuré : providers avec zone 78 → 123, « jamais localisables » 112 → 35
(16 fabricables, cuisines mourant sur des poissons ou des items-compagnons —
résidu honnête). Le Carapace Helm est gaté normalement : caché avec trois
zones, sa chaîne vivante à découverte complète via la forge de Manufacturing
West. C'est la leçon du signalement : quand la clôture garde trop de monde,
ce n'est pas la clôture qu'on élargit, c'est la donnée qu'on complète.


### « Pourquoi Raw Stuffed Mushroom Tray ? » — la cuisine était déclarée, jamais lue
Même méthode que le Helm : la chaîne mourait à découverte totale sur
l'Anteverse Cheese, dont la meule n'avait qu'une prose muette. Or la table
Cargo `Items` déclare les transformations de cuisine **en colonnes** :
`cookingCookedItem` (cuire X donne Y, 198 cas), `cookingPortionItem` (le
découper donne Z, 86) et `decayToItem` (le laisser tourner donne W, 287).
Jamais récupérées. Chaque colonne devient une source dérivée `from`, comme le
salvage — et la meule se relie aux curds, que la soupe au Vial of Milk
fabrique : toute la chaîne se gate normalement.

Deux garde-fous : 245 aliments pourrissent en Rotten Food, l'éventail complet
noierait sa fenêtre — même plafond que le salvage (6, tri stable). Et le
périmètre du dataset grandit de 134 items (1 153 → 1 287) : les aliments crus
que ces chaînes citent entrent avec leurs propres sources.

Il ne reste que **6 fabricables** que la donnée ne sait localiser nulle part —
des armes d'items-compagnons (Electro Pest, Magma Skink…), chaînes que le wiki
ne documente pas. Résidu assumé : toujours visibles, ingrédients floutés.


### « Electro Pest réclame un Capacitor caché » — la clôture protégeait en bloc
Dernier signalement de la série, et le plus fin : les six fabricables restants
(Electro Pest, Magma Skink…) sont des **purs crafts** — aucune source propre,
une recette. La clôture les gardait visibles parce que leur chaîne meurt à
découverte totale (« Pest (Pet) » n'est pas un item de la donnée : les
compagnons n'existent pas dans Cargo). Mais un pur craft n'a pas d'acquisition
inconnue à protéger : **sa recette est son acquisition**, parfaitement décrite.

La clôture se raffine donc en deux natures : une feuille que la donnée ne sait
pas localiser (Pest (Item) ← « Pest (Pet) ») reste toujours visible — inconnu
n'est pas spoiler ; un pur craft jamais-localisable ne se montre que si **tous
les ingrédients d'une de ses recettes sont visibles**, par point fixe sur ce
petit ensemble. L'Electro Pest suit donc son Capacitor : caché avec trois
zones, visible à découverte totale. Les deux invariants tiennent — le test
« toutes zones = tout » le garantit, et détecterait le jour où un cycle de
purs crafts morts apparaîtrait dans la donnée.


### « Et les coatings ? » — la prose qui reformule le craft n'est pas une source
Giganto Tincture restait listé avec un Anteverse Cheese et un Glow Eye cachés.
Cause : « can only be obtained through **mixing**. » Le parseur écartait déjà
les phrases « through crafting / upgrading / cooking » (SKIP_KEYWORDS), mais
pas leurs sœurs — *mixing* est la Chemistry Station, *distilling* la
Distillation Station, « adding water to a pot » l'amorce de toutes les soupes,
et les variantes « by / from » passaient aussi. Ces phrases devenaient des
sources sans géographie, donc « disponibles partout », alors qu'elles ne font
que reformuler des recettes que les tables Cargo portent déjà.

SKIP_KEYWORDS s'élargit ; 31 tinctures et coatings perdent leur source
fantôme, deviennent de purs crafts, et la clôture raffinée du signalement
précédent les juge par leur recette. Giganto Tincture suit son fromage ;
Alien Distillation, elle, reste visible *à bon droit* — sa recette de
distillation n'utilise que du poisson pêchable dès les premières zones.
Invariant toutes-zones vérifié, le cas au test de non-régression.


### « Et Holy Coating ? » — un drop conditionnel n'est pas une disponibilité
Dernière fuite de la série, en deux couches. La table de drops du Lab Rat dit
« Lodestone Fragment — **Completing Canaan** or the Security Sector » : une
condition de progression, que `chanceText` portait fidèlement… et que la
disponibilité ignorait — un rat d'Office Sector « prouvait » du contenu de fin
de jeu, et trois distillations remontaient jusqu'au Holy Coating. Règle : une
chance sans « % » est une condition, elle ne prouve rien (le drop reste affiché
dans la fenêtre, condition comprise — c'est de l'information, pas une preuve).

La seconde couche masquait la première : `build_providers` concaténait le
tableau de la page (riche, avec conditions) et la table Cargo `Enemies` (nue)
sans fusionner par item. Le Lodestone du rat existait donc **en deux lignes**,
et la ligne nue passait le filtre — en prime, les fenêtres de créatures
affichaient des doublons. Fusion par item, l'entrée riche gagne, `via` complété.

Contre-exemple qui valide : Charged Distillation reste visible via Black Gunk,
drop *ordinaire* (« ×2 », sans condition) du même rat. Le cas au test de
non-régression, l'invariant toutes-zones intact, 169 craftables à trois zones.


### « GROW Exor ? » — récolter un cadavre est un kill
Le mot-clé `harvesting` du parseur de prose vaut `grow` — juste pour les
plantes, faux pour « harvesting the remains of an Exor ». 48 sources
« cultivaient » des créatures. La table `Enemies` elle-même range ces butins en
`harvest1..10`, côté kill. Une passe post-providers requalifie : une source
`grow` dont la cible est une créature (`enemy`, `butcher`) devient un `drop`,
et disparaît quand un drop zoné du même monstre la couvre déjà — 47 élaguées,
1 requalifiée. Un test interdit désormais toute culture de créature dans le
dataset. Effet collatéral sain : l'Exor Quill perd sa source sans zone et se
gate correctement — les Exor ne rôdent pas dans les zones du début.


### « Exquisite Chain disponible ? Et je ne vois pas le lien »
Deux réponses. La disponibilité était **juste** : la page du Vintage Storage
Chest le place aussi à **Flathill** (« dans le petit bâtiment au bord du
terrain de jeu »), et il contient une Pocket Watch à 100 % — coffre → montre →
salvage → chaîne, tout dans les zones découvertes. L'app savait quelque chose
que le joueur ignorait… sans lui donner le moyen de le vérifier : « salvage
Pocket Watch (1) » était du texte mort, alors que « break Manufacturing Wood
Crate » est cliquable sur la même ligne.

L'asymétrie est levée : l'origine d'un salvage (`Source.from`) devient un lien
d'item — clic gauche le sélectionne, clic droit ouvre sa fenêtre, flou s'il est
hors zones. Le chemin se remonte désormais à la main : la chaîne → la montre →
le coffre → Flathill et son emplacement précis. Sans rappel de sélection
disponible, le nom reste au moins marqué `data-item` pour le clic droit.


### [REDACTED] : la prose se caviarde, elle ne se floute pas
Le flou ne peut rien pour une phrase d'obtention : « …salvaging a Pocket Watch
or Witch Skull » écrit le nom en toutes lettres. Demandé par l'utilisateur, et
dans la langue de l'univers — les documents GATE du jeu sont eux-mêmes
caviardés : tout nom d'item indisponible ou de zone non découverte devient un
littéral **[REDACTED]** dans les lignes d'emplacement. Un vrai remplacement,
pas un voile : rien à survoler, rien à copier.

Le piège d'implémentation : ne mettre dans le motif que les noms cachés
caviardait « Exquisite [REDACTED] » — l'item « Chain », indisponible, matchait
à l'intérieur du nom disponible « Exquisite Chain ». Le motif contient donc
**tous** les noms (≈ 1 300, compilé une fois par état de découverte), les plus
longs d'abord : un nom disponible protège ses sous-chaînes, et seuls les cachés
sont remplacés. Verrouillé sur les vraies données par le cas rapporté.


### Le voile devient un réglage : Hide / Blur / Show
Demandé après le caviardage de la prose : les **liens** aussi. Le flou et le
caviardage fusionnent en un réglage du panneau de découverte, `hide` par
défaut, porté par `Availability.spoilers` — le contexte de rendu qui circule
déjà partout.

`hide` est cohérent jusqu'au bout : nom remplacé par [REDACTED], vignette
muette « ? » (une icône identifie un item aussi bien que son nom), lien
désarmé — `data-item`/`data-provider` sautent, le bouton est `disabled`, le
clic droit sur un sujet voilé n'ouvre pas sa fenêtre, la carte montante perd
son clic. *Caché, c'est caché* : aucun geste ne révèle. `blur` garde l'ancien
comportement, survol révélateur. `show` laisse tout lisible, seules les listes
filtrent. Dans tous les modes, une recette garde tous ses ingrédients.

Au passage, `DetailsWindows` gagne un `dispose()` : ses écouteurs `document`
s'accumulaient entre les instances des tests.


## Déploiement : GitHub Pages, donnée et icônes dans le dépôt

Décidé avec l'utilisateur : dépôt passé **public** — le plan Free ne permet pas
Pages sur un dépôt privé, et un site Pages est de toute façon une URL publique
sur tous les plans hors Enterprise. Les images viennent du wiki public (assets
du jeu) : usage de groupe non commercial assumé, mention au README, retrait sur
demande. L'ancienne réserve « pas de redistribution de data/icons/ » est levée
en conséquence.

Deux aménagements techniques :
- **les icônes sont réduites à 256 px** (côté long) à l'arrivée du
  téléchargement, et le stock existant a été repassé : 180 Mo → 38 Mo. Le wiki
  sert les originaux — 3,4 Mo pour un portrait de Yeti affiché en 76 px. Nom de
  fichier inchangé, le cache de téléchargement reste valide ;
- **`base: "./"` et `import.meta.env.BASE_URL`** pour les icônes construites à
  l'exécution : le site vit sous `/abiotic-crafter/`, un `src="/Icon.png"`
  absolu chercherait à la racine du domaine.

Le workflow (`.github/workflows/deploy.yml`) fait `npm ci`, les tests, le
build, et publie `dist/` — jamais le scraper : la donnée voyage par le dépôt,
le build n'appelle pas le wiki.


### Windows 98 devient le défaut, « GATE terminal » devient « Modern Slop »
Demandé une fois le thème rétro adopté : il passe premier et par défaut (le
script inline d'index.html suit, pour que le premier rendu d'un visiteur neuf
soit déjà argenté). Le thème du mockup reste disponible sous son nouveau nom,
assumé. Le sélecteur quitte la barre du haut pour un onglet **Settings** tout à
droite ; « Zones » devient « Discovered Zones » ; et les deux panneaux
s'ancrent désormais sous leur bouton (`anchorBelow`) au lieu d'un coin fixe.


### Le « BUY » nu du Stapler
Les listes `=== Trading ===` des pages secteur disent qu'un item s'achète dans
la zone, pas à qui : la ligne rendait « BUY » tout seul, sous un « LOOT » — un
mot-clé sans complément qui ressemblait à un bug. Deux étages :

- **la donnée nomme le marchand quand il est sans ambiguïté** : les pages de
  PNJ portant une section de commerce (`{{Trade}}`) donnent la carte
  marchand → zones ; une zone à marchand unique attribue ses ventes (Marion à
  Flathill, le Blacksmith à Manufacturing West, Carson à Security). Office
  Sector en compte trois — attribuer au hasard serait mentir, on s'abstient ;
- **l'UI ne montre plus jamais un BUY nu** : à défaut de nom, « BUY from a
  local trader ». « LOOT » seul, lui, reste : les emplacements qui suivent le
  complètent.

Puis, relancé par l'utilisateur (« on sait qui vend des staplers quand même »),
le vrai gisement : le wiki n'a pas de table Cargo pour le commerce, mais **un
template d'inventaire par marchand** (`Template:Trade/warren`…), énumérés par
le switch de `Template:Trade`, reliés à leur PNJ par le `{{Trade|clé}}` de sa
page, et à leur zone par son `appearance1`. Chaque offre donne l'item vendu, le
coût et le déblocage : 55 offres deviennent des sources vendor complètes —
« BUY Warren Bunning » sur le Stapler, avec « Trades for 1 Raw Antefish Filet.
Unlocked: Going through the Far Garden exit portal. » en ligne d'emplacement.
La source de secteur sans nom, moins précise, est élaguée par le prune
habituel. Les déblocages d'inventaire ne rendent pas la source conditionnelle :
c'est de la progression mineure au sein d'une zone déjà atteinte, pas du
contenu d'une autre zone.


### « Les rats ne sont pas là au début » — la limite du wiki, et l'override
Signalé : le Lab Rat est marqué présent dans Office Sector, alors qu'en jeu il
n'y apparaît qu'une fois Manufacturing West atteint. Pas détectable : l'infobox
d'Office l'affirme (`enemy3 = Lab Rat`) et le seul contre-signal est une prose
sans déclencheur — « they begin to appear […] as the player progress ». Rien à
parser, même la table de drops n'en dit rien.

C'est le cas d'école de `data/overrides.json` : une correction humaine
par-dessus la donnée régénérée. Nouveau levier générique **`delayedPresence`**
(cible + zone) : les sources de drop du couple deviennent `conditional` —
affichées, mais ne prouvant aucune disponibilité, la machinerie des
« Completing Canaan » resservie telle quelle — et la zone quitte le provider,
dont la disponibilité passe par les zones où on le rencontre vraiment d'abord.
Effet mesuré : Rat Scanner et Rat Pack cessent d'être « disponibles » à Office
seul, et reviennent avec Manufacturing — exactement la réalité du jeu.


### La revue des créatures : deux corrections, deux non-cas
Balayage demandé après le Lab Rat : chaque créature zonée confrontée aux
phrases de progression de sa page (« begin to appear », « after completing »,
« can only spawn »…). Quatre alertes :

- **Symphonist** : « They can only spawn after fully completing Flathill » —
  l'infobox de Flathill le liste sans ce timing. Deuxième entrée
  `delayedPresence`, sa seule zone tombe : introuvable tant que la donnée ne
  sait pas modéliser « Flathill complété », comme les drops « Completing
  Canaan » ;
- **Peccary Sow** : son « Furniture Store » venait d'une sous-puce parlant de
  zombies (« ** After completing the Furniture Store multiple Zombies
  spawn… »). `zone_mentions` ignore désormais les sous-puces — elles décrivent
  des détails et des conséquences, pas des lieux de vie ;
- **Mystagogue** : son spawn conditionnel d'Office (« After activating Cloud
  Reactor ») n'était pas dans nos données — rien à corriger ;
- **Lab Rat** : déjà traité.

Le Zombie garde son Furniture Store : il le peuple réellement, c'est là qu'on
le rencontre.

## Les zones sans pastille étaient des redirections du wiki

Trois zones du sélecteur n'avaient ni image ni couleur : Mycofields, Power
Services, Divarication. Leur page wiki n'existe pas — ce sont des redirections
(`#REDIRECT [[…]]`) vers The Mycofields, Reactors#Locations et
Fragments#Botanical_Wing. Elles naissaient de sous-titres `== Locations ==` de
pages item qui emploient l'alias. Plutôt que de leur chercher une image, le
scraper suit désormais la redirection (`canonical_zone` dans `build.py`, appelée
au point d'entrée unique des sources et sur les zones des providers) : les
fantômes fusionnent dans leur zone réelle. 28 zones, toutes avec pastille et
couleur ; « Uncharted » retombe à North Pole et Temple of Stone, les deux seuls
lieux que le wiki ne relie vraiment à rien.
