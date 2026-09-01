import { beforeEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "./settings";
import { THEMES } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<button id="settings">Settings</button>`;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-censor");
});

describe("l'onglet Settings", () => {
  it("porte le sélecteur de thème, Windows 98 en premier et par défaut", () => {
    new SettingsPanel(document.getElementById("settings") as HTMLButtonElement);
    const select = document.querySelector<HTMLSelectElement>(".settings-panel select")!;
    expect([...select.options].map((o) => o.textContent))
      .toEqual(["Windows 98", "Modern Slop"]);
    expect(select.value).toBe("win98");
    expect(document.documentElement.dataset.theme).toBe("win98");
    expect(THEMES[0]!.id).toBe("win98");
  });

  it("cache les lignes [REDACTED] sur demande, et s'en souvient", () => {
    new SettingsPanel(document.getElementById("settings") as HTMLButtonElement);
    const box = document.querySelector<HTMLInputElement>(
      ".settings-panel input[type=checkbox]")!;
    // défaut : on montre la censure, on ne la cache pas
    expect(box.checked).toBe(false);
    expect(document.documentElement.dataset.censor).toBeUndefined();

    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.censor).toBe("on");

    // une nouvelle instance relit le réglage et repose l'attribut
    document.documentElement.removeAttribute("data-censor");
    document.body.innerHTML = `<button id="settings">Settings</button>`;
    new SettingsPanel(document.getElementById("settings") as HTMLButtonElement);
    expect(document.documentElement.dataset.censor).toBe("on");
    expect(document.querySelector<HTMLInputElement>(
      ".settings-panel input[type=checkbox]")!.checked).toBe(true);
  });

  it("tombe de son bouton et se referme d'un clic dehors", () => {
    const button = document.getElementById("settings") as HTMLButtonElement;
    new SettingsPanel(button);
    const panel = document.querySelector<HTMLElement>(".settings-panel")!;
    expect(panel.hidden).toBe(true);

    button.click();
    expect(panel.hidden).toBe(false);
    expect(panel.style.top).not.toBe("");     // ancré sous le bouton
    expect(button.classList.contains("open")).toBe(true);   // bouton enfoncé

    document.body.click();
    expect(panel.hidden).toBe(true);
    expect(button.classList.contains("open")).toBe(false);
  });
});
