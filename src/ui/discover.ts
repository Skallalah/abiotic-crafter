import { frontier, type DiscoveryState, type SpoilerMode } from "../core/discovery";
import type { Model } from "../core/tree";
import { spoil, zoneTag } from "./format";

/** Doit rester distinct de la session : changer d'objet ne touche pas à ça. */
const KEY = "gate-crafting-index/discovery";

/** Le début du jeu : ce que coche un premier lancement. */
const START_ZONE = "Office Sector";

/**
 * État de découverte enregistré, assaini contre le dataset.
 *
 * Une zone renommée ou disparue d'un build à l'autre est ignorée plutôt que de
 * traîner en fantôme ; un stockage absent ou illisible donne le défaut décidé
 * avec l'utilisateur : **suivi actif, Office Sector coché** — l'app s'ouvre
 * sans spoiler, et le panneau permet de tout désactiver d'un clic.
 */
const SPOILER_MODES: { id: SpoilerMode; label: string }[] = [
  { id: "hide", label: "Hide" },
  { id: "blur", label: "Blur" },
  { id: "show", label: "Show" },
];

export function loadDiscovery(model: Model): DiscoveryState {
  const known = new Set(model.ds.zones.map((z) => z.name));
  const fallback: DiscoveryState = {
    enabled: true,
    zones: new Set(known.has(START_ZONE) ? [START_ZONE] : []),
    spoilers: "hide",
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      enabled?: unknown; zones?: unknown; spoilers?: unknown;
    };
    if (typeof parsed.enabled !== "boolean" || !Array.isArray(parsed.zones)) {
      return fallback;
    }
    return {
      enabled: parsed.enabled,
      zones: new Set(parsed.zones.filter(
        (z): z is string => typeof z === "string" && known.has(z),
      )),
      spoilers: SPOILER_MODES.some((m) => m.id === parsed.spoilers)
        ? parsed.spoilers as SpoilerMode
        : "hide",
    };
  } catch {
    return fallback;
  }
}

function save(state: DiscoveryState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      enabled: state.enabled,
      zones: [...state.zones],
      spoilers: state.spoilers ?? "hide",
    }));
  } catch {
    // stockage indisponible : l'état tient pour la session en cours
  }
}

/**
 * Le panneau de découverte (§5.7), ancré sous la barre du haut.
 *
 * Trois états par zone : découverte (cochée, re-cliquable pour revenir en
 * arrière — sans cascade, l'utilisateur reste maître) ; en frontière (floutée,
 * le survol révèle, le clic découvre) ; au-delà — pas rendue du tout, c'est ça
 * l'anti-spoil. Les orphelines que rien ne relie vivent sous « Uncharted ».
 */
export class DiscoverPanel {
  private state: DiscoveryState;
  private readonly panel: HTMLElement;
  private readonly button: HTMLButtonElement;

  constructor(
    private readonly model: Model,
    button: HTMLButtonElement,
    private readonly onChange: (state: DiscoveryState) => void,
  ) {
    this.state = loadDiscovery(model);
    this.button = button;
    this.panel = document.createElement("div");
    this.panel.className = "discover-panel";
    this.panel.hidden = true;
    document.body.appendChild(this.panel);

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleOpen();
    });
    document.addEventListener("click", (event) => {
      if (!this.panel.hidden && !this.panel.contains(event.target as Node)) {
        this.panel.hidden = true;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.panel.hidden = true;
    });

    this.render();
  }

  current(): DiscoveryState {
    return this.state;
  }

  /** Utile aux autres composants : « N items beyond your zones » ouvre ici. */
  open(): void {
    this.panel.hidden = false;
    this.render();
  }

  private toggleOpen(): void {
    this.panel.hidden = !this.panel.hidden;
    if (!this.panel.hidden) this.render();
  }

  private apply(state: DiscoveryState): void {
    this.state = state;
    save(state);
    this.render();
    this.onChange(state);
  }

  private discover(zone: string, on: boolean): void {
    const zones = new Set(this.state.zones);
    if (on) zones.add(zone);
    else zones.delete(zone);
    this.apply({ ...this.state, zones });
  }

  // ------------------------------------------------------------------ rendu

  private render(): void {
    const { enabled, zones } = this.state;
    this.button.textContent = enabled
      ? `Zones ${zones.size}/${this.model.ds.zones.length}`
      : "Zones — all";
    this.button.title = "Which zones you have discovered";

    const inFrontier = new Map(
      frontier(this.model, this.state).map((f) => [f.zone, f.uncharted]),
    );

    const head = document.createElement("label");
    head.className = "discover-head";
    const master = document.createElement("input");
    master.type = "checkbox";
    master.checked = enabled;
    master.addEventListener("change", () => {
      this.apply({ ...this.state, enabled: master.checked });
    });
    head.append(master, " Track discovery");

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = enabled
      ? "Blurred zones border what you know — hover to peek, click to discover."
      : "Everything is visible. Enable tracking to hide what you have not reached.";

    // le sort des items hors zones : caviardés, floutés, ou en clair
    const modes = document.createElement("div");
    modes.className = "spoiler-modes";
    if (enabled) {
      const title = document.createElement("span");
      title.textContent = "Spoilers";
      modes.appendChild(title);
      for (const mode of SPOILER_MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode.label;
        button.className = (this.state.spoilers ?? "hide") === mode.id ? "on" : "";
        button.title = {
          hide: "Unreachable items become [REDACTED] — nothing to hover, nothing to open",
          blur: "Unreachable items are blurred — hover to reveal",
          show: "Everything readable, only the lists are filtered",
        }[mode.id];
        button.addEventListener("click", () => {
          this.apply({ ...this.state, spoilers: mode.id });
        });
        modes.appendChild(button);
      }
    }

    const list = document.createElement("div");
    list.className = "discover-list";
    const uncharted = document.createElement("div");
    uncharted.className = "discover-list";

    if (enabled) {
      for (const zone of this.model.ds.zones) {
        const discovered = zones.has(zone.name);
        const bordering = inFrontier.has(zone.name);
        if (!discovered && !bordering) continue;   // au-delà : rien à voir
        const target = inFrontier.get(zone.name) ? uncharted : list;
        target.appendChild(this.row(zone.name, !!zone.parent, discovered));
      }
      // une orpheline déjà découverte reste rangée sous Uncharted
      for (const zone of this.model.ds.zones) {
        if (zones.has(zone.name) && this.isOrphan(zone.name)) {
          const row = list.querySelector(`[data-zone="${CSS.escape(zone.name)}"]`);
          if (row) uncharted.appendChild(row);
        }
      }
    }

    this.panel.replaceChildren(head, note, modes, list);
    if (uncharted.childElementCount > 0) {
      const title = document.createElement("div");
      title.className = "discover-title";
      title.textContent = "Uncharted";
      title.title = "Places the wiki links to nothing";
      this.panel.append(title, uncharted);
    }
  }

  private isOrphan(name: string): boolean {
    const zone = this.model.zone(name);
    if (!zone || zone.parent || zone.links?.length) return false;
    return !this.model.ds.zones.some(
      (other) => other.parent === name || other.links?.includes(name),
    );
  }

  private row(name: string, indent: boolean, discovered: boolean): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `dz${indent ? " sub" : ""}${discovered ? " on" : ""}`;
    row.dataset.zone = name;

    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = discovered ? "✓" : "";

    const tag = zoneTag(this.model, name);
    if (!discovered) spoil(tag);

    row.append(mark, tag);
    row.title = discovered ? `Forget ${name}` : "Hover to peek — click to discover";
    row.addEventListener("click", () => this.discover(name, !discovered));
    return row;
  }
}
