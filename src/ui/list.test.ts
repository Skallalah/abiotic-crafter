import { beforeEach, describe, expect, it } from "vitest";
import { ItemList } from "./list";
import { Model } from "../core/tree";
import { computeAvailability } from "../core/discovery";
import { mockupDataset } from "../core/fixtures";
import type { Dataset } from "../data/types";

/**
 * Dataset du mockup recatégorisé : la fixture met tout dans « Test », or la
 * barre de catégories a besoin de plusieurs groupes — et d'un item hors des
 * zones de départ (mfg_gadget, fabriqué depuis Manufacturing West seulement).
 */
function categorizedDataset(): Dataset {
  const ds = mockupDataset();
  ds.items.glowstick!.category = "Tools";
  ds.items.box_of_screws!.category = "Tools";
  ds.items.circuit_board!.category = "Divers";
  ds.items.mfg_part = {
    id: "mfg_part", name: "Mfg Part", wikiTitle: "Mfg_Part", category: "Ghost Gear",
    stack: 8, sources: [{ kind: "pickup", zone: "Manufacturing West", where: ["Partout"] }],
    meta: { fetchedAt: "2026-08-31T00:00:00Z", verified: true },
  };
  ds.items.mfg_gadget = {
    id: "mfg_gadget", name: "Mfg Gadget", wikiTitle: "Mfg_Gadget", category: "Ghost Gear",
    stack: 1, sources: [],
    meta: { fetchedAt: "2026-08-31T00:00:00Z", verified: true },
  };
  ds.recipes.push({
    id: "r_mfg_gadget_1", kind: "craft",
    output: { item: "mfg_gadget", qty: 1 },
    inputs: [{ item: "mfg_part", qty: 2 }],
    bench: "Crafting Bench",
  });
  return ds;
}

const model = new Model(categorizedDataset());
const everything = computeAvailability(model, { enabled: false, zones: new Set() });
const officeOnly = computeAvailability(model,
  { enabled: true, zones: new Set(["Office Sector"]) });

function mount(): ItemList {
  const list = new ItemList(model, () => {}, () => {});
  list.setAvailability(everything);
  return list;
}

const catButtons = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".catbar button")];
const listedNames = () =>
  [...document.querySelectorAll<HTMLElement>("#itemlist button[data-item] span")]
    .filter((s) => !s.className).map((s) => s.textContent);
const groupTitles = () =>
  [...document.querySelectorAll<HTMLElement>("#itemlist .group")].map((g) => g.textContent);

beforeEach(() => {
  // jsdom n'implémente pas scrollIntoView, que setCurrent appelle
  Element.prototype.scrollIntoView = () => {};
  document.body.innerHTML = `
    <input id="search">
    <div id="catbar" class="catbar"></div>
    <ul id="itemlist"></ul>`;
  localStorage.clear();
});

describe("barre de catégories", () => {
  it("rend All puis une icône par catégorie présente, Divers en dernier", () => {
    mount();
    expect(catButtons().map((b) => b.title)).toEqual([
      "All categories", "Ghost Gear", "Test", "Tools", "Divers",
    ]);
    for (const b of catButtons()) {
      expect(b.querySelector("svg path")!.getAttribute("fill")).toBe("currentColor");
    }
    // All est l'état par défaut, bouton enfoncé
    expect(catButtons().filter((b) => b.classList.contains("on")).map((b) => b.title))
      .toEqual(["All categories"]);
  });

  it("filtre la liste sur la catégorie cliquée, intertitre conservé", () => {
    mount();
    catButtons().find((b) => b.title === "Tools")!.click();
    expect(groupTitles()).toEqual(["Tools"]);
    expect(listedNames()).toEqual(["Box of Screws", "Glowstick"]);
    expect(catButtons().filter((b) => b.classList.contains("on")).map((b) => b.title))
      .toEqual(["Tools"]);
    // All ramène tout, groupes comme avant
    catButtons()[0]!.click();
    expect(groupTitles()).toEqual(["Divers", "Ghost Gear", "Test", "Tools"]);
  });

  it("compose avec la recherche", () => {
    mount();
    catButtons().find((b) => b.title === "Tools")!.click();
    const input = document.getElementById("search") as HTMLInputElement;
    input.value = "glow";
    input.dispatchEvent(new Event("input"));
    expect(listedNames()).toEqual(["Glowstick"]);
    // « circuit » existe, mais pas chez Tools : le message cite la recherche
    input.value = "circuit";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector("#itemlist .empty")!.textContent)
      .toContain('"circuit"');
  });

  it("nomme la catégorie quand elle est vide faute de zones", () => {
    const list = mount();
    list.setAvailability(officeOnly);
    expect(catButtons().some((b) => b.title === "Ghost Gear")).toBe(true);
    catButtons().find((b) => b.title === "Ghost Gear")!.click();
    expect(document.querySelector("#itemlist .empty")!.textContent)
      .toBe("No craftable item in Ghost Gear within your zones.");
  });

  it("retient le choix, et retombe sur All pour une valeur inconnue", () => {
    mount();
    catButtons().find((b) => b.title === "Tools")!.click();

    document.body.innerHTML = document.body.innerHTML.replace(/<button.*?<\/button>/gs, "");
    document.getElementById("catbar")!.replaceChildren();
    mount();
    expect(catButtons().filter((b) => b.classList.contains("on")).map((b) => b.title))
      .toEqual(["Tools"]);
    expect(groupTitles()).toEqual(["Tools"]);

    localStorage.setItem("gate-crafting-index/category", "Chapeaux");
    document.getElementById("catbar")!.replaceChildren();
    mount();
    expect(catButtons().filter((b) => b.classList.contains("on")).map((b) => b.title))
      .toEqual(["All categories"]);
  });

  it("s'efface si l'objet sélectionné vit dans une autre catégorie", () => {
    // arriver sur Circuit Board par un lien montant ne doit pas laisser une
    // liste filtrée sur Tools sans entrée active
    const list = mount();
    catButtons().find((b) => b.title === "Tools")!.click();
    list.setCurrent("circuit_board");
    expect(catButtons().filter((b) => b.classList.contains("on")).map((b) => b.title))
      .toEqual(["All categories"]);
    expect(document.querySelector("#itemlist button.active")).toBeTruthy();
    expect(localStorage.getItem("gate-crafting-index/category")).toBeNull();
  });
});
