import { anchorBelow } from "./discover";
import { mountThemePicker } from "./theme";

/** Distinct de la session, comme le thème : un réglage d'interface. */
const CENSOR_KEY = "gate-crafting-index/censor";

/**
 * Le réglage « cacher les lignes [REDACTED] » vit sur `<html data-censor>` :
 * tout le travail est fait par le CSS (`:has`), aucun re-rendu nécessaire —
 * les lignes tues disparaissent, où qu'elles soient rendues.
 */
export function censorHidden(): boolean {
  try {
    return localStorage.getItem(CENSOR_KEY) === "on";
  } catch {
    return false;
  }
}

export function applyCensor(on: boolean): void {
  if (on) document.documentElement.dataset.censor = "on";
  else delete document.documentElement.dataset.censor;
  try {
    localStorage.setItem(CENSOR_KEY, on ? "on" : "off");
  } catch {
    // le réglage tient pour la session en cours
  }
}

/**
 * L'onglet Settings, tout à droite de la barre : les réglages d'interface.
 *
 * Le sélecteur de thème vivait dans la barre elle-même — un réglage qu'on
 * touche deux fois par an n'a pas à occuper cet espace en permanence. Le
 * panneau tombe de son bouton, comme celui de la découverte.
 */
export class SettingsPanel {
  private readonly panel: HTMLElement;

  constructor(button: HTMLButtonElement) {
    this.panel = document.createElement("div");
    this.panel.className = "discover-panel settings-panel";
    this.panel.hidden = true;

    const title = (text: string) => {
      const heading = document.createElement("div");
      heading.className = "discover-title";
      heading.textContent = text;
      return heading;
    };

    const row = document.createElement("label");
    row.className = "settings-row";
    const select = document.createElement("select");
    select.className = "theme";
    select.title = "Interface theme";
    row.append("Theme ", select);
    this.panel.append(title("Style"), row);
    document.body.appendChild(this.panel);

    mountThemePicker(select);

    // cacher plutôt que caviarder : une ligne touchée par un [REDACTED]
    // n'apparaît plus du tout
    const censorRow = document.createElement("label");
    censorRow.className = "settings-row";
    const censor = document.createElement("input");
    censor.type = "checkbox";
    censor.checked = censorHidden();
    censor.title = "Redacted lines disappear instead of showing [REDACTED]";
    censor.addEventListener("change", () => applyCensor(censor.checked));
    censorRow.append(censor, " Hide [REDACTED] lines");
    this.panel.append(title("Misc."), censorRow);
    applyCensor(censor.checked);   // remet l'attribut d'aplomb au chargement

    // panneau et bouton vont ensemble : ouvert = bouton enfoncé (`.open`)
    const show = (visible: boolean) => {
      this.panel.hidden = !visible;
      button.classList.toggle("open", visible);
      if (visible) anchorBelow(button, this.panel);
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      show(this.panel.hidden);
    });
    document.addEventListener("click", (event) => {
      if (!this.panel.hidden && !this.panel.contains(event.target as Node)) {
        show(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) show(false);
    });
  }
}
