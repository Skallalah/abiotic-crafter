import { anchorBelow } from "./discover";
import { mountThemePicker } from "./theme";

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

    const row = document.createElement("label");
    row.className = "settings-row";
    const select = document.createElement("select");
    select.className = "theme";
    select.title = "Interface theme";
    row.append("Theme ", select);
    this.panel.appendChild(row);
    document.body.appendChild(this.panel);

    mountThemePicker(select);

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden) anchorBelow(button, this.panel);
    });
    document.addEventListener("click", (event) => {
      if (!this.panel.hidden && !this.panel.contains(event.target as Node)) {
        this.panel.hidden = true;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.panel.hidden = true;
    });
  }
}
