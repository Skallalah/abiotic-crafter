import type { Item, Source } from "../data/types";
import type { Availability } from "../core/discovery";
import type { Model } from "../core/tree";

/** Abréviation 3 lettres affichée quand l'icône manque (§6). */
export function abbreviation(name: string): string {
  // La ponctuation ne porte pas d'information : « Keypad Hacker (Tier 2) »
  // doit donner KHT, pas KH(.
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]!).join("").toUpperCase();
  if (words.length === 2) return (words[0]!.slice(0, 2) + words[1]![0]!).toUpperCase();
  return (words[0] ?? "").slice(0, 3).toUpperCase() || "?";
}

/**
 * Classe de couleur de la tuile (§6) : matériau de recherche, sauf pour les
 * items qui ne s'obtiennent qu'en tuant quelque chose (rouge) et pour le gear
 * (ambre).
 */
export function tileClass(model: Model, item: Item): string {
  if (item.gearSlot) return "gear";
  const material = item.researchMaterial?.toLowerCase();
  if (material === "tech") return "tech";
  if (material === "metal") return "metal";
  if (material === "glass") return "glass";
  if (material === "bio") return "bio";
  if (item.sources.length > 0 && item.sources.every((s) => s.kind === "drop")) return "drop";
  return model.isCraftable(item.id) ? "gear" : "metal";
}

export function tile(model: Model, item: Item): HTMLElement {
  const span = document.createElement("span");
  span.className = `tile ${tileClass(model, item)}`;
  span.textContent = abbreviation(item.name);
  if (item.icon) {
    const img = document.createElement("img");
    img.src = `/${item.icon}`;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    span.appendChild(img);
  }
  return span;
}

export function badges(model: Model, id: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "badges";
  if (model.isCraftable(id)) wrap.appendChild(badge("craft", "Craft"));
  if (model.isLootable(id)) wrap.appendChild(badge("loot", "Loot"));
  return wrap;
}

function badge(kind: string, label: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `badge ${kind}`;
  el.textContent = label;
  return el;
}

/** « 3 stacks + 12 (64) » (§5.4.1). */
export function stackText(item: Item, qty: number): string {
  if (item.stack <= 1) return "";
  if (qty <= item.stack) return `${qty} / ${item.stack}`;
  const full = Math.floor(qty / item.stack);
  const rest = qty % item.stack;
  return `${full} stack${full > 1 ? "s" : ""}${rest ? ` + ${rest}` : ""} (${item.stack})`;
}

/**
 * Mot-clé anglais de chaque manière d'obtenir un objet.
 *
 * En anglais comme les noms d'items et de zones, qui viennent du wiki : mêler
 * « casser Monitor » à « Manufacturing West » se lisait mal. Chaque mot-clé
 * reçoit sa couleur en CSS (`.kw-drop` en rouge, `.kw-pickup` en vert…), ce qui
 * permet de repérer la nature d'une provenance sans lire la ligne.
 */
export const KIND_KEYWORD: Record<Source["kind"], string> = {
  pickup: "loot",
  break: "break",
  drop: "kill",
  vendor: "buy",
  salvage: "salvage",
  grow: "grow",
};

/** Ce qui suit le mot-clé : la cible, l'objet démonté, ou rien. */
function sourceObject(model: Model, source: Source): string {
  if (source.kind === "salvage" && source.from) {
    const name = model.has(source.from) ? model.item(source.from).name : source.from;
    return `${name}${source.qtyMax ? ` (${source.qtyMax})` : ""}`;
  }
  return source.target ?? "";
}

/** Version texte d'une source : « break Computer ». Sert aux infobulles. */
export function sourceLabel(model: Model, source: Source): string {
  const object = sourceObject(model, source);
  const keyword = KIND_KEYWORD[source.kind];
  return object ? `${keyword} ${object}` : keyword;
}

/**
 * Une provenance, sur sa propre ligne, mot-clé coloré à part.
 *
 * Les provenances étaient jusqu'ici jointes par des puces médianes en un bloc
 * qui revenait à la ligne selon la largeur du panneau : on ne distinguait plus
 * les méthodes les unes des autres.
 */
export function sourceLine(
  model: Model,
  source: Source,
  availability?: Availability,
  onSelect?: (id: string) => void,
): HTMLLIElement {
  const li = document.createElement("li");
  const keyword = document.createElement("span");
  keyword.className = `kw kw-${source.kind}`;
  keyword.textContent = KIND_KEYWORD[source.kind];
  li.appendChild(keyword);

  const object = sourceObject(model, source);
  if (!object) return li;

  // « break Manufacturing Wood Crate » : la caisse a sa propre fenêtre, on la
  // rend cliquable ici plutôt que chez les quatre appelants de sourceLine.
  if (source.targetId && model.hasProvider(source.targetId)) {
    const link = providerLink(source.targetId, object);
    if (availability && !availability.provider(source.targetId)) {
      veilProvider(availability, link);
    }
    li.append(" ", link);
  } else if (source.from && model.has(source.from) && onSelect) {
    // « salvage Pocket Watch (1) » : l'origine est un item, aussi vivant qu'un
    // contenant — clic gauche le sélectionne, clic droit ouvre sa fenêtre, où
    // l'on découvre par exemple que le coffre à montres existe aussi à Flathill
    const link = itemLink(model, source.from, onSelect, object);
    if (availability) veilName(availability, source.from, link);
    li.append(" ", link);
  } else {
    const text = document.createElement("span");
    text.textContent = object;
    if (source.from && model.has(source.from)) text.dataset.item = source.from;
    // « salvage Fire Extinguisher (2) » ne doit pas nommer une origine qu'on
    // n'a pas encore croisée
    if (availability && source.from) veilName(availability, source.from, text);
    li.append(" ", text);
  }
  return li;
}

/** Le réglage spoiler pour un lien de contenant indisponible. */
function veilProvider(availability: Availability, link: HTMLButtonElement): void {
  if (availability.spoilers === "show") return;
  if (availability.spoilers === "blur") {
    spoil(link);
    return;
  }
  link.replaceChildren(redactedBar());
  link.classList.add("censored");
  link.title = "Beyond your discovered zones";
  delete link.dataset.provider;
  link.disabled = true;
}

/** Nom d'un contenant, cliquable : clic gauche comme clic droit ouvrent sa fenêtre. */
export function providerLink(id: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link provider";
  button.dataset.provider = id;
  button.textContent = label;
  button.title = `${label} — what's inside, and where`;
  return button;
}

/** Nom d'un item, cliquable : clic gauche le sélectionne, clic droit l'ouvre. */
export function itemLink(model: Model, id: string, onSelect: (id: string) => void,
                         label = model.item(id).name): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link item";
  button.dataset.item = id;
  button.textContent = label;
  button.title = `Observe ${model.item(id).name}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(id);
  });
  return button;
}

/**
 * Nom d'une zone, précédé de sa pastille.
 *
 * L'icône et la couleur viennent toutes deux du wiki — la couleur est extraite
 * de l'image, si bien qu'elles ne peuvent pas se contredire. La couleur est
 * posée en `--zone` sur l'élément : le cerclage de la pastille s'en sert, et
 * les appelants peuvent la reprendre pour un filet ou un fond.
 *
 * « Other methods » n'est pas une zone du jeu : ni pastille, ni couleur.
 */
export function zoneTag(model: Model, name: string): HTMLElement {
  const zone = model.zone(name);
  const tag = document.createElement("span");
  tag.className = "zonetag";
  if (zone?.color) tag.style.setProperty("--zone", zone.color);

  if (zone?.icon) {
    const img = document.createElement("img");
    img.className = "zoneicon";
    img.src = `/${zone.icon}`;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    tag.appendChild(img);
  }
  tag.append(name);
  return tag;
}

/**
 * Voile anti-spoil (§5.7) : grisé et flouté, le survol révèle.
 *
 * Rien ne disparaît — une recette garde tous ses ingrédients — mais un item
 * hors des zones découvertes ne se lit pas sans un geste délibéré.
 */
export function spoil(el: HTMLElement): HTMLElement {
  el.classList.add("spoiler");
  el.title = "Beyond your discovered zones — hover to reveal";
  return el;
}

/** La barre de censure, identique à celle de la prose. */
function redactedBar(): HTMLElement {
  const bar = document.createElement("span");
  bar.className = "redacted";
  bar.textContent = "[REDACTED]";
  return bar;
}

/**
 * Applique le réglage spoiler (§5.7) à un élément qui nomme un item.
 *
 * `hide` (défaut) : le nom devient un [REDACTED] **inerte** — plus de survol,
 * plus de clic, plus de fenêtre au clic droit, l'attribut `data-item` saute.
 * Caché, c'est caché. `blur` : le flou d'avant, le survol révèle. `show` :
 * rien. Ne fait rien si l'item est disponible.
 */
export function veilName(availability: Availability, id: string, el: HTMLElement): void {
  if (availability.item(id) || availability.spoilers === "show") return;
  if (availability.spoilers === "blur") {
    spoil(el);
    return;
  }
  el.replaceChildren(redactedBar());
  el.classList.add("censored");
  el.title = "Beyond your discovered zones";
  delete el.dataset.item;
  if (el instanceof HTMLButtonElement) el.disabled = true;
}

/** Même réglage pour la vignette : son icône identifie l'item aussi bien que
 * son nom. En `hide`, elle devient une pastille muette « ? ». */
export function veilTile(availability: Availability, id: string, tileEl: HTMLElement): void {
  if (availability.item(id) || availability.spoilers === "show") return;
  if (availability.spoilers === "blur") {
    spoil(tileEl);
    return;
  }
  tileEl.querySelector("img")?.remove();
  tileEl.textContent = "?";
  tileEl.className = "tile censored";
}

/** Mot-clé coloré isolé, pour les lignes qui n'ont pas de source à décrire. */
export function keyword(text: string, kind: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `kw kw-${kind}`;
  span.textContent = text;
  return span;
}

/**
 * Où aller chercher l'origine d'un objet dérivé.
 *
 * C'est le point de la fonctionnalité : « démonter Fire Extinguisher » ne dit
 * pas où trouver l'extincteur. On rend donc ses propres sources, zone comprise,
 * et à défaut on dit au moins qu'il faut le fabriquer.
 */
export function originLines(
  model: Model,
  origin: string,
  sources: Source[],
  availability?: Availability,
  onSelect?: (id: string) => void,
): HTMLLIElement[] {
  if (availability) sources = sources.filter((s) => availability.source(s));
  const localised = sources.filter((s) => s.zone);
  const lines: HTMLLIElement[] = [];
  const seen = new Set<string>();

  const push = (li: HTMLLIElement) => {
    const key = li.textContent ?? "";
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(li);
  };

  for (const source of localised) {
    const li = sourceLine(model, source, availability, onSelect);
    // le nom de la zone d'abord : c'est l'information qu'on cherche ici
    const zone = document.createElement("b");
    zone.textContent = source.zone!;
    li.prepend(zone, " — ");
    push(li);
  }
  if (lines.length > 0) return lines;

  for (const source of sources) push(sourceLine(model, source, availability, onSelect));
  if (lines.length > 0) return lines;

  const fallback = document.createElement("li");
  if (model.isCraftable(origin)) fallback.appendChild(keyword("craft", "craft"));
  else if (availability && !availability.item(origin)) {
    fallback.textContent = "in undiscovered zones";
  } else fallback.textContent = "no known location";
  return [fallback];
}

/** Comme `sourceLabel`, mais vide quand la source ne désigne rien de concret. */
export function sourceDetail(model: Model, source: Source): string {
  return source.target || source.from ? sourceLabel(model, source) : "";
}

/** Provenances affichées d'emblée ; le reste passe derrière « + N more ». */
export const MAX_SOURCES = 5;

/** Emplacements affichés d'emblée. Plus bas : ce sont des phrases entières. */
export const MAX_SPOTS = 3;

/**
 * Liste plafonnée, le reste derrière un bouton « + N more ».
 *
 * La version d'origine tronquait silencieusement, si bien qu'on ne savait pas
 * qu'il manquait des lignes. Partagée entre le bilan et les fenêtres de détail :
 * les deux montrent les mêmes provenances, elles doivent se replier pareil.
 */
export function sourceList(
  lines: HTMLLIElement[],
  max = MAX_SOURCES,
  className = "sources",
): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = className;
  lines.forEach((li, index) => {
    if (index >= max) li.hidden = true;
    ul.appendChild(li);
  });

  if (lines.length > max) {
    const more = document.createElement("li");
    more.className = "more-sources";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `+ ${lines.length - max} more`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      for (const li of lines) li.hidden = false;
      more.remove();
    });
    more.appendChild(button);
    ul.appendChild(more);
  }
  return ul;
}

/**
 * Caviardage des phrases d'obtention (§5.7).
 *
 * « …salvaging a Pocket Watch or Witch Skull » : le flou ne peut rien pour de
 * la prose, le nom y est en toutes lettres. Tout nom d'item indisponible ou de
 * zone non découverte devient un littéral [REDACTED] — les documents GATE du
 * jeu sont eux-mêmes caviardés, on parle la langue de l'univers. Remplacement
 * réel, pas un voile : rien à survoler, rien à copier.
 *
 * Le motif (≈ 700 noms) est compilé une fois par état de découverte.
 */
const REDACTORS = new WeakMap<Availability, (text: string) => (string | Node)[]>();

export function redactor(model: Model, availability?: Availability) {
  if (!availability || !availability.enabled || availability.spoilers === "show") {
    return (text: string) => [text];
  }
  let apply = REDACTORS.get(availability);
  if (apply) return apply;

  // TOUS les noms entrent dans le motif, pas seulement les cachés : « Chain »
  // (indisponible) matchait à l'intérieur d'« Exquisite Chain » (disponible).
  // Les plus longs d'abord, le nom disponible protège ainsi sa sous-chaîne —
  // et seuls les cachés sont remplacés.
  const hidden = new Set<string>();
  const names: string[] = [];
  for (const item of Object.values(model.ds.items)) {
    names.push(item.name);
    if (!availability.item(item.id)) hidden.add(item.name);
  }
  for (const zone of model.ds.zones) {
    names.push(zone.name);
    if (!availability.zone(zone.name)) hidden.add(zone.name);
  }
  names.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![A-Za-z])(?:${names.map(escapeRegExp).join("|")})(?![a-z])`, "g");

  apply = (text: string) => {
    const parts: (string | Node)[] = [];
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (!hidden.has(match[0])) continue;      // un nom disponible reste en clair
      if (match.index! > cursor) parts.push(text.slice(cursor, match.index));
      if (availability.spoilers === "blur") {
        const veiled = document.createElement("span");
        veiled.textContent = match[0];
        parts.push(spoil(veiled));
      } else {
        parts.push(redactedBar());
      }
      cursor = match.index! + match[0].length;
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };
  REDACTORS.set(availability, apply);
  return apply;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Délimiteur posé par le scraper entre une sous-zone et son emplacement. */
export const SPOT_SEP = " › ";

/**
 * Ce qui le remplace à l'écran. Deux raisons de ne pas recopier le `›` :
 * la fonte pixel du thème rétro n'a pas de U+203A, et un caractère qui retombe
 * sur une autre fonte au milieu d'une ligne se voit tout de suite. `»` existe
 * dans les deux fontes.
 */
const SHOWN_SEP = " » ";

/**
 * Un emplacement, avec sa sous-zone mise en avant : « Level 2 » Bio Lab D. ».
 *
 * Le séparateur est du vrai texte et non un `::before` : une première version
 * le tirait du CSS, et tout ce qu'on copiait depuis la page revenait collé —
 * « Level 2Data Farms. ».
 */
export function spotLine(
  spot: string,
  model?: Model,
  availability?: Availability,
): HTMLLIElement {
  const redact = model ? redactor(model, availability) : (t: string) => [t];
  const li = document.createElement("li");
  const cut = spot.indexOf(SPOT_SEP);
  if (cut > 0) {
    const area = document.createElement("b");
    area.textContent = spot.slice(0, cut);
    li.append(area, SHOWN_SEP, ...redact(spot.slice(cut + SPOT_SEP.length)));
  } else {
    li.append(...redact(spot));
  }
  return li;
}

/** Retire les accents pour une recherche tolérante (§5.2). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
