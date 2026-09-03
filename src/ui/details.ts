import WinBox from "winbox/src/js/winbox.js";
import "winbox/dist/css/winbox.min.css";

import type { Availability } from "../core/discovery";
import type { Model } from "../core/tree";
import { BODY_ICONS, DAMAGE_FALLBACK, DAMAGE_TYPES, svgIcon } from "./icons";
import { armRetrobar } from "./retrobar";
import {
  OTHER_METHODS, containerSources, sourceZones, zoneContents,
} from "../core/zones";
import type {
  Drop, ItemId, Provider, ProviderId, Source, Zone,
} from "../data/types";
import {
  ASSET_BASE, abbreviation, badges, itemLink, keyword, MAX_SPOTS, sourceLines,
  sourceList, spoil, spotLine, tile, veilName, veilPlain, veilTile, zoneTag,
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

/** Tuiles montrées d'emblée par section de la fenêtre de secteur. */
const MAX_CELLS = 12;

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
interface OpenWindow {
  win: WinBox;
  body: HTMLElement;
  render: () => DocumentFragment;
}

export class DetailsWindows {
  private readonly open = new Map<string, OpenWindow>();
  private readonly unbind: (() => void)[] = [];

  constructor(
    private readonly model: Model,
    private readonly onSelect: (id: ItemId) => void,
    private readonly wikiBase: string,
    private availability: Availability,
  ) {
    this.bindContextMenu();
  }

  /**
   * La découverte a changé : les fenêtres ouvertes doivent raconter la même
   * géographie que le reste de l'app, sans être fermées ni déplacées.
   */
  setAvailability(availability: Availability): void {
    this.availability = availability;
    for (const { body, render } of this.open.values()) {
      body.replaceChildren(render());
    }
  }

  /**
   * Le clic droit, règle unique et partout : il remonte au plus proche élément
   * qui se déclare, et n'entrave le menu du navigateur que là.
   */
  /** Détache les écouteurs globaux — les tests créent plusieurs instances. */
  dispose(): void {
    this.closeAll();
    for (const off of this.unbind) off();
    this.unbind.length = 0;
  }

  private bindContextMenu(): void {
    const onContextMenu = (event: MouseEvent) => {
      const el = (event.target as Element | null)
        ?.closest?.("[data-provider], [data-item]") as HTMLElement | null;
      if (!el) return;
      const { provider, item } = el.dataset;
      const hide = this.availability.spoilers === "hide";
      if (provider && this.model.hasProvider(provider)) {
        // caché c'est caché : la fenêtre d'un sujet voilé le révélerait
        if (hide && !this.availability.provider(provider)) return;
        this.openProvider(provider, event);
      } else if (item && this.model.has(item)) {
        if (hide && !this.availability.item(item)) return;
        this.openItem(item, event);
      } else return;
      event.preventDefault();
    };

    // clic gauche sur un nom de contenant : il n'est pas sélectionnable comme
    // objet courant, l'ouvrir est la seule chose qu'il puisse faire
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)
        ?.closest?.("[data-provider]") as HTMLElement | null;
      const id = el?.dataset.provider;
      if (id && this.model.hasProvider(id)) {
        event.stopPropagation();
        this.openProvider(id, event);
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("click", onClick, true);
    this.unbind.push(
      () => document.removeEventListener("contextmenu", onContextMenu),
      () => document.removeEventListener("click", onClick, true),
    );
  }

  openItem(id: ItemId, at?: MouseEvent): void {
    const item = this.model.item(id);
    this.window(`item:${id}`, item.name, at, () => this.itemView(id));
  }

  openProvider(id: ProviderId, at?: MouseEvent): void {
    const provider = this.model.provider(id)!;
    this.window(`provider:${id}`, provider.name, at, () => this.providerView(id));
  }

  /**
   * La fenêtre d'un secteur — « qu'est-ce que je trouve ici ? ». Ouverte par
   * les pastilles de zone. Une pseudo-zone du bilan n'a rien à montrer, et un
   * secteur non découvert ne s'ouvre pas en mode Hide : caché, c'est caché.
   */
  openZone(name: string, at?: MouseEvent): void {
    if (!this.model.zone(name)) return;
    if (this.availability.spoilers === "hide" && !this.availability.zone(name)) return;
    this.window(`zone:${name}`, name, at, () => this.zoneView(name));
  }

  /** La fenêtre du plan de courses (§5.8) — singleton comme les autres. */
  openPlan(render: () => DocumentFragment): void {
    this.window("plan", "Plan", undefined, render);
  }

  /** Re-rend une fenêtre précise si elle est ouverte (le plan a changé). */
  refreshWindow(key: string): void {
    const open = this.open.get(key);
    if (open) open.body.replaceChildren(open.render());
  }

  /** Posé par main.ts : « + Add to plan » au pied des fenêtres d'item. */
  onPin?: (id: ItemId) => void;

  /** Ferme tout — utile aux tests et à un futur raccourci. */
  closeAll(): void {
    for (const { win } of [...this.open.values()]) win.close(true);
    this.open.clear();
  }

  private window(key: string, title: string, at: MouseEvent | undefined,
                 render: () => DocumentFragment): void {
    const existing = this.open.get(key);
    if (existing) {
      // rouvrir le même sujet le ramène devant plutôt que d'empiler un doublon
      existing.win.focus();
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
    // l'ascenseur win98 en DOM sur le corps défilant
    const scroller = body.parentElement;
    if (scroller?.parentElement) armRetrobar(scroller, scroller.parentElement);
    shadeOnDoubleClick(win);
    this.open.set(key, { win, body, render });
  }

  // ------------------------------------------------------------------ item

  private itemView(id: ItemId): DocumentFragment {
    const item = this.model.item(id);
    const fragment = document.createDocumentFragment();

    // les propriétés comme un wiki : une par ligne, étiquette + valeur —
    // la ligne unique à séparateurs se lisait comme une énigme
    const props: [string, string][] = [["Category", item.category]];
    if (item.weight) props.push(["Weight", `${item.weight} kg`]);
    if (item.stack > 1) props.push(["Stacks to", String(item.stack)]);
    if (item.researchMaterial) props.push(["Research", item.researchMaterial]);
    if (item.gearSlot) props.push(["Gear slot", item.gearSlot]);
    fragment.appendChild(this.head(item.name, propList(props), tile(this.model, item),
                                   badges(this.model, id)));

    if (item.description) {
      const p = document.createElement("p");
      p.className = "flavor";
      p.textContent = item.description;
      fragment.appendChild(p);
    }

    // même sans source déclarée, un contenant peut lâcher l'item (byZone
    // complète par les tables de loot) : la section vaut d'être tentée
    {
      const zones = this.byZone(id, item.sources);
      const block = document.createElement("div");
      let hidden = 0;
      for (const [zone, sources] of zones) {
        if (!this.availability.zone(zone)) {
          hidden += 1;              // le compte, jamais les noms
          continue;
        }
        block.appendChild(this.zoneBlock(
          zone,
          sourceList(sourceLines(this.model, sources, this.availability, this.onSelect)),
          [],
        ));
      }
      if (hidden > 0) block.appendChild(undiscoveredNote(hidden));
      if (block.childElementCount > 0) {
        fragment.appendChild(this.section("Where to find", block));
      }
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
    // les propriétés comme un wiki, une par ligne — même traitement que la
    // fenêtre d'item. L'infobox {{enemy}} de la page fournit la fiche ; ses
    // champs sont tous optionnels, on n'affiche que ce que le wiki sait.
    const stats = provider.enemy;
    const props: [string, string][] =
      [["Type", stats?.type ?? KIND_LABEL[provider.kind]]];
    if (stats) {
      if (stats.codename) props.push(["Codename", stats.codename]);
      if (stats.origin) props.push(["Origin", stats.origin]);
      if (stats.identifiedBy) props.push(["Identified by", stats.identifiedBy]);
      for (const [label, attack] of
           [["Melee", stats.melee], ["Ranged", stats.ranged]] as const) {
        if (attack) {
          props.push([label, [attack.damage, attack.type]
            .filter(Boolean).join(" — ")]);
        }
      }
    }
    fragment.appendChild(this.head(provider.name, propList(props),
                                   providerTile(provider)));

    // la santé et les sensibilités côte à côte : à gauche une ligne par
    // partie du corps, à droite les types de dégâts iconés et colorés
    const vitals = document.createElement("div");
    vitals.className = "vitals";
    if (stats?.health) {
      const block = document.createElement("div");
      block.className = "health";
      for (const part of ["head", "torso", "arms", "legs"] as const) {
        const value = stats.health[part];
        if (!value) continue;
        const row = document.createElement("div");
        row.className = "hp";
        const label = document.createElement("span");
        label.className = "part";
        label.textContent = part[0]!.toUpperCase() + part.slice(1);
        const amount = document.createElement("b");
        amount.textContent = value;
        row.append(svgIcon(BODY_ICONS[part]), label, amount);
        block.appendChild(row);
      }
      vitals.appendChild(this.section("Health", block));
    }
    const senscol = document.createElement("div");
    senscol.className = "senscol";
    for (const [label, list] of [
      ["Weakness", stats?.weakness],
      ["Resistance", stats?.resistance],
      ["Immunity", stats?.immunity],
    ] as const) {
      if (!list?.length) continue;
      const block = document.createElement("div");
      block.className = "sens";
      for (const type of list) {
        const damage = DAMAGE_TYPES[type] ?? DAMAGE_FALLBACK;
        const row = document.createElement("div");
        row.className = "hp";
        const icon = svgIcon(damage.icon);
        icon.style.color = damage.color;
        const name = document.createElement("span");
        name.textContent = type;
        row.append(icon, name);
        block.appendChild(row);
      }
      senscol.appendChild(this.section(label, block));
    }
    if (senscol.childElementCount > 0) vitals.appendChild(senscol);
    if (vitals.childElementCount > 0) fragment.appendChild(vitals);

    if (provider.zones.length > 0) {
      const block = document.createElement("div");
      let hidden = 0;
      for (const entry of provider.zones) {
        if (!this.availability.zone(entry.zone)
            || (entry.requires && !this.availability.zone(entry.requires))) {
          hidden += 1;              // présence retardée : compter, pas nommer
          continue;
        }
        block.appendChild(this.zoneBlock(entry.zone, null, entry.where ?? []));
      }
      if (hidden > 0) block.appendChild(undiscoveredNote(hidden));
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

  // ---------------------------------------------------------------- secteur

  /**
   * L'inventaire du secteur, une section par nature, en tuiles compactes.
   *
   * Volontairement sans détail : chaque tuile est vivante (clic gauche
   * sélectionne un item ou ouvre un contenant, clic droit ouvre la fiche) —
   * étaler les tables de loot ici noierait la fenêtre. Un item que la zone ne
   * lâche que par ses contenants n'apparaît dans aucune liste d'items : il se
   * découvre en ouvrant la fiche du contenant, comme en jeu.
   */
  private zoneView(name: string): DocumentFragment {
    const zone = this.model.zone(name)!;
    const contents = zoneContents(this.model, name);
    const fragment = document.createDocumentFragment();

    const parts: string[] = [];
    const count = (n: number, word: string) => {
      if (n > 0) parts.push(`${n} ${word}${n > 1 ? "s" : ""}`);
    };
    count(contents.env.length + contents.somewhere.length, "item");
    count(contents.containers.length, "container");
    count(contents.creatures.length, "creature");
    count(contents.nodes.length, "resource node");
    count(contents.traders.length, "trader");
    fragment.appendChild(this.head(name,
      parts.join(" · ") || "The wiki lists nothing for this sector.",
      zoneTile(zone, name)));

    const grid = (cells: HTMLLIElement[]) => sourceList(cells, MAX_CELLS, "zonegrid");
    const add = (title: string, count: number, cells: () => HTMLLIElement[]) => {
      if (count > 0) {
        fragment.appendChild(this.section(`${title} (${count})`, grid(cells())));
      }
    };
    add("Lying around", contents.env.length,
      () => contents.env.map((id) => this.itemCell(id)));
    add("Somewhere in the zone", contents.somewhere.length,
      () => contents.somewhere.map((id) => this.itemCell(id)));
    add("Containers", contents.containers.length,
      () => contents.containers.map((p) => this.providerCell(p)));
    add("Creatures", contents.creatures.length,
      () => contents.creatures.map((p) => this.providerCell(p)));
    add("Resource nodes", contents.nodes.length,
      () => contents.nodes.map((p) => this.providerCell(p)));

    if (contents.traders.length > 0) {
      const lines = contents.traders.map((trader) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = trader.name;
        // un marchand dont tous les échanges attendent une zone (Ulrich vend à
        // Office, mais seulement une fois Albatross atteinte) est un spoiler
        if (!trader.sources.some((s) => this.availability.source(s))) {
          veilPlain(this.availability, name);
        }
        li.append(keyword("buy", "vendor"), " from ", name);
        return li;
      });
      fragment.appendChild(this.section(
        contents.traders.length > 1
          ? `Traders (${contents.traders.length})` : "Trader",
        sourceList(lines)));
    }

    fragment.appendChild(this.foot(name.replace(/ /g, "_")));
    return fragment;
  }

  /** Tuile + nom, vivante comme partout : clic = sélection, clic droit = fiche. */
  private itemCell(id: ItemId): HTMLLIElement {
    const item = this.model.item(id);
    const cell = document.createElement("li");
    cell.className = "cell";
    cell.dataset.item = id;
    cell.title = `Observe ${item.name}`;

    const thumb = tile(this.model, item);
    veilTile(this.availability, id, thumb);
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = item.name;
    veilName(this.availability, id, label);
    cell.append(thumb, label);

    if (this.availability.spoilers === "hide" && !this.availability.item(id)) {
      delete cell.dataset.item;
      cell.title = "Beyond your discovered zones";
      return cell;
    }
    cell.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onSelect(id);
    });
    return cell;
  }

  /** Le clic global sur `data-provider` ouvre sa fiche : rien d'autre à câbler. */
  private providerCell(provider: Provider): HTMLLIElement {
    const cell = document.createElement("li");
    cell.className = "cell";
    cell.dataset.provider = provider.id;
    cell.title = `${provider.name} — what's inside, and where`;

    const thumb = document.createElement("span");
    thumb.className = "tile";
    thumb.textContent = abbreviation(provider.name);
    if (provider.icon) {
      const img = document.createElement("img");
      img.src = ASSET_BASE + provider.icon;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove());
      thumb.appendChild(img);
    }
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = provider.name;
    cell.append(thumb, label);

    // présence retardée : un provider peut rester voilé dans sa propre zone
    if (!this.availability.provider(provider.id)
        && this.availability.spoilers !== "show") {
      if (this.availability.spoilers === "blur") return spoil(cell) as HTMLLIElement;
      const bar = document.createElement("span");
      bar.className = "redacted";
      bar.textContent = "[REDACTED]";
      label.replaceChildren(bar);
      label.classList.add("censored");
      thumb.querySelector("img")?.remove();
      thumb.textContent = "?";
      thumb.className = "tile censored";
      cell.title = "Beyond your discovered zones";
      delete cell.dataset.provider;
    }
    return cell;
  }

  // ---------------------------------------------------------------- commun

  private head(name: string, subtitle: string | HTMLElement,
               illustration: HTMLElement, extra?: HTMLElement): HTMLElement {
    const head = document.createElement("div");
    head.className = "details-head";

    const text = document.createElement("div");
    const title = document.createElement("h3");
    title.append(name);
    if (extra) title.append(" ", extra);
    text.append(title);
    if (typeof subtitle === "string") {
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = subtitle;
      text.appendChild(sub);
    } else {
      text.appendChild(subtitle);
    }

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
      if (this.onPin) {
        const pin = document.createElement("button");
        pin.type = "button";
        pin.textContent = "+ Add to plan";
        pin.title = "Pin this craft to the shopping list";
        pin.addEventListener("click", () => this.onPin!(observe));
        foot.appendChild(pin);
      }
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
   * Une source sans zone rejoint les zones de son origine localisée
   * (`sourceZones`) — « ouvrir une Toolbox » s'affiche sous Office, où sont
   * les Toolbox — sinon la même pseudo-zone que le bilan, en dernier : la
   * fenêtre ne doit pas raconter une autre géographie que la colonne de
   * droite.
   */
  private byZone(id: ItemId, sources: readonly Source[]): [string, Source[]][] {
    const groups = new Map<string, Source[]>();
    const add = (zone: string, source: Source) => {
      const list = groups.get(zone);
      if (list) list.push(source);
      else groups.set(zone, [source]);
    };
    for (const source of sources) {
      const zones = source.zone
        ? [source.zone]
        : sourceZones(this.model, source, this.availability);
      if (zones.length === 0) add(OTHER_METHODS, source);
      for (const zone of zones) add(zone, source);
    }
    // les contenants qui lâchent l'item, d'après les tables de loot — sans
    // filtre de découverte : la fenêtre montre tout, les voiles font le reste
    for (const { zone, source } of containerSources(this.model, id)) {
      add(zone, source);
    }
    // dans un bloc, le disponible d'abord : la troncature « +N more » ne
    // doit pas cacher la seule méthode utilisable derrière six [REDACTED]
    const veiled = (s: Source) =>
      (s.targetId && !this.availability.provider(s.targetId))
      || (s.from && this.model.has(s.from) && !this.availability.item(s.from))
        ? 1 : 0;
    for (const list of groups.values()) {
      list.sort((a, b) => veiled(a) - veiled(b));
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
    block.appendChild(zoneTag(this.model, zone, (name, at) => this.openZone(name, at)));

    if (ways) block.appendChild(ways);
    if (spots.length > 0) {
      block.appendChild(sourceList(
        unique(spots).map((spot) => spotLine(spot, this.model, this.availability)),
        MAX_SPOTS, "spots"));
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
      const link = itemLink(this.model, entry.id, (id) => this.onSelect(id));
      veilName(this.availability, entry.id, link);
      label.append(link, " ", badges(this.model, entry.id));

      const note = document.createElement("span");
      note.className = "stack";
      // une ligne [REDACTED] ne dit rien d'autre : sa quantité ou sa condition
      // (« Completing Canaan… ») nommerait ce qu'on vient de taire
      const censored = this.availability.spoilers === "hide"
        && !this.availability.item(entry.id);
      if (!censored) note.textContent = entry.note;

      const thumb = tile(this.model, item);
      veilTile(this.availability, entry.id, thumb);
      if (this.availability.spoilers === "hide" && !this.availability.item(entry.id)) {
        delete row.dataset.item;
      }
      row.append(thumb, label, note);
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

/** Propriétés façon wiki : étiquette discrète, valeur en clair, une par ligne. */
function propList(props: [string, string][]): HTMLElement {
  const dl = document.createElement("dl");
  dl.className = "props";
  for (const [label, value] of props) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  return dl;
}

/** « + N zones not yet discovered » — le compte, jamais les noms. */
function undiscoveredNote(count: number): HTMLElement {
  const note = document.createElement("div");
  note.className = "flavor";
  note.textContent = count === 1
    ? "+ 1 zone not yet discovered"
    : `+ ${count} zones not yet discovered`;
  return note;
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
    img.src = ASSET_BASE + provider.icon;
    img.alt = "";
    img.addEventListener("error", () => img.remove());
    span.appendChild(img);
  }
  return span;
}

/** La pastille du secteur en grand, cerclée de sa couleur quand le wiki l'a. */
function zoneTile(zone: Zone, name: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "tile big";
  span.textContent = abbreviation(name);
  if (zone.color) span.style.setProperty("--zone", zone.color);
  if (zone.icon) {
    const img = document.createElement("img");
    img.src = ASSET_BASE + zone.icon;
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
