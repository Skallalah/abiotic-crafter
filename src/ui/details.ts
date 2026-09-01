import WinBox from "winbox/src/js/winbox.js";
import "winbox/dist/css/winbox.min.css";

import type { Model } from "../core/tree";
import { OTHER_METHODS } from "../core/zones";
import type { Drop, ItemId, Provider, ProviderId, Source } from "../data/types";
import {
  badges, itemLink, MAX_SPOTS, sourceLine, sourceList, spotLine, tile, zoneTag,
} from "./format";

const KIND_LABEL: Record<Provider["kind"], string> = {
  container: "Container — search it",
  destroyable: "Destroyable object — break it",
  pickup: "Object — pick it up",
  salvage: "Furniture — salvage it",
  butcher: "Catch — butcher it",
  enemy: "Creature — kill it",
};

const WIDTH = 380;
const HEIGHT = 440;

/**
 * Les fenêtres de détail, ouvertes au clic droit là où on a cliqué.
 *
 * Le bilan ne disait qu'un nom : « break Manufacturing Wood Crate ». On ne
 * savait ni à quoi la caisse ressemble, ni ce qu'elle contient d'autre, ni si
 * elle en vaut la peine. Chaque item cité est un lien qui le sélectionne — le
 * même `setRoot` que la liste de gauche.
 *
 * Plusieurs fenêtres cohabitent, déplaçables et refermables une à une : c'est
 * le tri qui remplace un historique. Le déplacement vient de WinBox.js, seule
 * dépendance front du projet, embarquée dans le bundle comme le reste.
 */
export class DetailsWindows {
  private readonly open = new Map<string, WinBox>();

  constructor(
    private readonly model: Model,
    private readonly onSelect: (id: ItemId) => void,
    private readonly wikiBase: string,
  ) {
    this.bindContextMenu();
  }

  /**
   * Le clic droit, règle unique et partout : il remonte au plus proche élément
   * qui se déclare, et n'entrave le menu du navigateur que là.
   */
  private bindContextMenu(): void {
    document.addEventListener("contextmenu", (event) => {
      const el = (event.target as Element | null)
        ?.closest?.("[data-provider], [data-item]") as HTMLElement | null;
      if (!el) return;
      const { provider, item } = el.dataset;
      if (provider && this.model.hasProvider(provider)) this.openProvider(provider, event);
      else if (item && this.model.has(item)) this.openItem(item, event);
      else return;
      event.preventDefault();
    });

    // clic gauche sur un nom de contenant : il n'est pas sélectionnable comme
    // objet courant, l'ouvrir est la seule chose qu'il puisse faire
    document.addEventListener("click", (event) => {
      const el = (event.target as Element | null)
        ?.closest?.("[data-provider]") as HTMLElement | null;
      const id = el?.dataset.provider;
      if (id && this.model.hasProvider(id)) {
        event.stopPropagation();
        this.openProvider(id, event);
      }
    }, true);
  }

  openItem(id: ItemId, at?: MouseEvent): void {
    const item = this.model.item(id);
    this.window(`item:${id}`, item.name, at, () => this.itemView(id));
  }

  openProvider(id: ProviderId, at?: MouseEvent): void {
    const provider = this.model.provider(id)!;
    this.window(`provider:${id}`, provider.name, at, () => this.providerView(id));
  }

  /** Ferme tout — utile aux tests et à un futur raccourci. */
  closeAll(): void {
    for (const win of [...this.open.values()]) win.close(true);
    this.open.clear();
  }

  private window(key: string, title: string, at: MouseEvent | undefined,
                 render: () => DocumentFragment): void {
    const existing = this.open.get(key);
    if (existing) {
      // rouvrir le même sujet le ramène devant plutôt que d'empiler un doublon
      existing.focus();
      return;
    }

    const body = document.createElement("div");
    body.className = "details-body";
    body.appendChild(render());

    const { x, y } = anchor(at);
    const win = new WinBox({
      title,
      // déplaçable et refermable, rien d'autre : ni réduire, ni agrandir
      class: ["app", "no-min", "no-max", "no-full"],
      x, y, width: WIDTH, height: HEIGHT,
      minwidth: 260, minheight: 160,
      background: "var(--frame)",
      border: 0,
      mount: body,
      onclose: () => { this.open.delete(key); },
    });
    shadeOnDoubleClick(win);
    this.open.set(key, win);
  }

  // ------------------------------------------------------------------ item

  private itemView(id: ItemId): DocumentFragment {
    const item = this.model.item(id);
    const fragment = document.createDocumentFragment();

    const meta: string[] = [item.category];
    if (item.weight) meta.push(`${item.weight} kg`);
    if (item.stack > 1) meta.push(`stacks to ${item.stack}`);
    if (item.researchMaterial) meta.push(`${item.researchMaterial} research`);
    if (item.gearSlot) meta.push(item.gearSlot);
    fragment.appendChild(this.head(item.name, meta.join(" · "), tile(this.model, item),
                                   badges(this.model, id)));

    if (item.description) {
      const p = document.createElement("p");
      p.className = "flavor";
      p.textContent = item.description;
      fragment.appendChild(p);
    }

    if (item.sources.length > 0) {
      const zones = this.byZone(item.sources);
      const block = document.createElement("div");
      for (const [zone, sources] of zones) {
        block.appendChild(this.zoneBlock(
          zone,
          sourceList(sources.map((source) => sourceLine(this.model, source))),
          sources.flatMap((source) => source.where ?? []),
        ));
      }
      fragment.appendChild(this.section("Where to find", block));
    }

    const recipes = this.model.recipesFor(id);
    for (const recipe of recipes) {
      const block = document.createElement("div");
      const bench = document.createElement("div");
      bench.className = "bench";
      bench.textContent = recipe.output.qty > 1
        ? `${recipe.bench} — makes ${recipe.output.qty}`
        : recipe.bench;
      block.appendChild(bench);
      if (recipe.unlock) {
        const unlock = document.createElement("div");
        unlock.className = "flavor";
        unlock.textContent = recipe.unlock;
        block.appendChild(unlock);
      }
      block.appendChild(this.itemRows(
        recipe.inputs.map((input) => ({ id: input.item, note: `×${input.qty}` })),
      ));
      const title = recipes.length > 1
        ? `Recipe ${recipes.indexOf(recipe) + 1} of ${recipes.length}`
        : "Recipe";
      fragment.appendChild(this.section(title, block));
    }

    const parents = this.model.usedIn(id);
    if (parents.length > 0) {
      fragment.appendChild(this.section(
        `Used in ${parents.length} craft${parents.length > 1 ? "s" : ""}`,
        this.itemRows(parents.map((p) => ({ id: p.item, note: `×${p.qty}` }))),
      ));
    }

    fragment.appendChild(this.foot(item.wikiTitle, id));
    return fragment;
  }

  // -------------------------------------------------------------- contenant

  private providerView(id: ProviderId): DocumentFragment {
    const provider = this.model.provider(id)!;
    const fragment = document.createDocumentFragment();
    fragment.appendChild(this.head(provider.name, KIND_LABEL[provider.kind],
                                   providerTile(provider)));

    if (provider.zones.length > 0) {
      const block = document.createElement("div");
      for (const entry of provider.zones) {
        block.appendChild(this.zoneBlock(entry.zone, null, entry.where ?? []));
      }
      fragment.appendChild(this.section("Where to find it", block));
    }

    const drops = [...provider.drops].sort(byChance);
    const harvest = drops.filter((d) => d.via === "harvest");
    const rest = drops.filter((d) => d.via !== "harvest");
    if (rest.length > 0) {
      fragment.appendChild(this.section(
        provider.kind === "enemy" ? "Drops" : "Contents",
        this.itemRows(rest.map((d) => ({ id: d.item, note: dropNote(d) }))),
      ));
    }
    if (harvest.length > 0) {
      fragment.appendChild(this.section(
        "Harvest", this.itemRows(harvest.map((d) => ({ id: d.item, note: dropNote(d) }))),
      ));
    }
    if (drops.length === 0) {
      const empty = document.createElement("div");
      empty.className = "flavor";
      empty.textContent = "The wiki does not document what it holds.";
      fragment.appendChild(empty);
    }

    fragment.appendChild(this.foot(provider.wikiTitle));
    return fragment;
  }

  // ---------------------------------------------------------------- commun

  private head(name: string, subtitle: string, illustration: HTMLElement,
               extra?: HTMLElement): HTMLElement {
    const head = document.createElement("div");
    head.className = "details-head";

    const text = document.createElement("div");
    const title = document.createElement("h3");
    title.append(name);
    if (extra) title.append(" ", extra);
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = subtitle;
    text.append(title, sub);

    head.append(illustration, text);
    return head;
  }

  private foot(wikiTitle: string | undefined, observe?: ItemId): HTMLElement {
    const foot = document.createElement("div");
    foot.className = "details-foot";
    if (observe) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Observe this item";
      button.title = "Make it the current item";
      button.addEventListener("click", () => this.onSelect(observe));
      foot.appendChild(button);
    }
    if (wikiTitle) {
      const link = document.createElement("a");
      link.className = "wiki";
      link.href = this.wikiBase + encodeURIComponent(wikiTitle);
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = "wiki page ↗";
      foot.appendChild(link);
    }
    return foot;
  }

  /**
   * Les sources d'un item groupées par zone, dans l'ordre de progression.
   *
   * Sans zone (salvage, marchand non localisé) : la même pseudo-zone que le
   * bilan, et en dernier — la fenêtre ne doit pas raconter une autre géographie
   * que la colonne de droite.
   */
  private byZone(sources: readonly Source[]): [string, Source[]][] {
    const groups = new Map<string, Source[]>();
    for (const source of sources) {
      const zone = source.zone ?? OTHER_METHODS;
      const list = groups.get(zone);
      if (list) list.push(source);
      else groups.set(zone, [source]);
    }
    return [...groups].sort(([a], [b]) => this.rank(a) - this.rank(b));
  }

  private rank(zone: string): number {
    return zone === OTHER_METHODS ? Number.MAX_SAFE_INTEGER : this.model.zoneRank(zone);
  }

  /**
   * Un lieu, et **sous lui** ce qu'on y sait de précis.
   *
   * Les emplacements étaient jusqu'ici tous entassés sous les zones, si bien
   * qu'un Computer listait « Vehicle Lot 07 » et « Botanical Wing » à la suite
   * sans dire lequel appartenait à quel secteur — sept secteurs d'écart.
   */
  private zoneBlock(zone: string, ways: HTMLElement | null, spots: string[]): HTMLElement {
    const block = document.createElement("div");
    block.className = "zoneblock";
    const color = this.model.zone(zone)?.color;
    if (color) block.style.setProperty("--zone", color);
    block.appendChild(zoneTag(this.model, zone));

    if (ways) block.appendChild(ways);
    if (spots.length > 0) {
      block.appendChild(sourceList(unique(spots).map(spotLine), MAX_SPOTS, "spots"));
    }
    return block;
  }

  private section(title: string, content: HTMLElement): HTMLElement {
    const block = document.createElement("div");
    block.className = "details-section";
    const h = document.createElement("h4");
    h.textContent = title;
    block.append(h, content);
    return block;
  }

  /** Une ligne par item : vignette, nom cliquable, et sa quantité ou sa chance. */
  private itemRows(entries: { id: ItemId; note: string }[]): HTMLElement {
    const list = document.createElement("div");
    list.className = "rows";
    for (const entry of entries) {
      if (!this.model.has(entry.id)) continue;
      const item = this.model.item(entry.id);
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.item = entry.id;

      const label = document.createElement("span");
      label.append(itemLink(this.model, entry.id, (id) => this.onSelect(id)),
                   " ", badges(this.model, entry.id));

      const note = document.createElement("span");
      note.className = "stack";
      note.textContent = entry.note;

      row.append(tile(this.model, item), label, note);
      list.appendChild(row);
    }
    return list;
  }
}

/**
 * Double-clic sur la barre de titre : la fenêtre s'enroule sur elle-même.
 *
 * Elle reste là où on l'a posée — c'est ce qui la distingue du `minimize` de
 * WinBox, qui l'envoie dans une pile en bas de l'écran. Garder trois caisses
 * côte à côte réduites à leur titre, c'est le même tri que fermer celles dont
 * on n'a plus besoin. Le double-clic natif de WinBox agrandit, mais `no-max`
 * le désactive : la voie est libre.
 */
function shadeOnDoubleClick(win: WinBox): void {
  const header = win.dom.querySelector(".wb-header");
  header?.addEventListener("dblclick", () => win.toggleClass("shaded"));
}

/** Coin haut-gauche de la fenêtre : au curseur, sans déborder de l'écran. */
function anchor(event?: MouseEvent): { x: number; y: number } {
  const width = window.innerWidth || WIDTH;
  const height = window.innerHeight || HEIGHT;
  if (!event) return { x: Math.max(0, (width - WIDTH) / 2), y: 60 };
  return {
    x: Math.max(8, Math.min(event.clientX + 12, width - WIDTH - 8)),
    y: Math.max(8, Math.min(event.clientY - 20, height - HEIGHT - 8)),
  };
}

/** Image du contenant, en grand : « à quoi ça ressemble » est la première question. */
function providerTile(provider: Provider): HTMLElement {
  const span = document.createElement("span");
  span.className = "tile big";
  span.textContent = provider.name.slice(0, 2).toUpperCase();
  span.dataset.provider = provider.id;
  if (provider.icon) {
    const img = document.createElement("img");
    img.src = `/${provider.icon}`;
    img.alt = "";
    img.addEventListener("error", () => img.remove());
    span.appendChild(img);
  }
  return span;
}

/** « ×0–3 · 25% » ; la phrase du wiki quand la chance n'est pas un pourcentage. */
function dropNote(drop: Drop): string {
  const parts: string[] = [];
  if (drop.qtyMax !== undefined) {
    parts.push(drop.qtyMin === drop.qtyMax ? `×${drop.qtyMax}` : `×${drop.qtyMin}–${drop.qtyMax}`);
  }
  if (drop.chanceText) parts.push(drop.chanceText);
  else if (drop.chance !== undefined) parts.push(percent(drop.chance));
  return parts.join(" · ");
}

function percent(chance: number): string {
  const value = chance * 100;
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(value < 1 ? 2 : 1))}%`;
}

/** Le plus probable d'abord : c'est ce qu'on vient chercher. */
function byChance(a: Drop, b: Drop): number {
  return (b.chance ?? 1) - (a.chance ?? 1);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
