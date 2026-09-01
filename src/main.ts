import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/themes/win98.css";

import { dataset } from "./data/load";
import { computeAvailability, type Availability } from "./core/discovery";
import { Model } from "./core/tree";
import type { ItemId } from "./data/types";
import { Canvas, type View } from "./ui/canvas";
import { DetailsWindows } from "./ui/details";
import { DiscoverPanel } from "./ui/discover";
import { SettingsPanel } from "./ui/settings";
import { ItemList } from "./ui/list";
import { Summary } from "./ui/summary";
import { TreeView } from "./ui/tree-view";

const STORAGE_KEY = "gate-crafting-index/session";
const WIKI = "https://abioticfactor.wiki.gg/wiki/";

interface Session {
  root: ItemId;
  expanded: string[];
  choice: [ItemId, number][];
  view: View;
}

new SettingsPanel(document.getElementById("settings") as HTMLButtonElement);

const model = new Model(dataset);

const defaultRoot = model.has("keypad_hacker")
  ? "keypad_hacker"
  : Object.keys(dataset.items).find((id) => model.isCraftable(id))!;

let root: ItemId = defaultRoot;
let expanded = new Set<string>([root]);
let choice = new Map<ItemId, number>();
let highlighted: ItemId | null = null;

const canvas = new Canvas(() => save());

// la découverte filtre toute l'app : l'état vit dans le panneau, la
// disponibilité est recalculée à chaque changement et redistribuée partout
const discover = new DiscoverPanel(
  model,
  document.getElementById("discover") as HTMLButtonElement,
  (state) => {
    availability = computeAvailability(model, state);
    list.setAvailability(availability);
    details.setAvailability(availability);
    renderAll();
  },
);
let availability: Availability = computeAvailability(model, discover.current());

// le clic droit ouvre la fenêtre de détail ; elle sélectionne par le même
// chemin que la liste de gauche, pour que « ça change l'objet vu » soit vrai
const details = new DetailsWindows(model, (id) => setRoot(id), WIKI, availability);
const list = new ItemList(model, (id) => setRoot(id), () => discover.open());
list.setAvailability(availability);
const summary = new Summary(model, (id) => setHighlight(id), (id) => setRoot(id));
const tree = new TreeView(model, canvas.stage, {
  toggle: (path) => {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    // le bilan suit le dépli : il doit être recalculé à chaque pli
    renderAll();
    save();
  },
  highlight: (id) => setHighlight(id),
  open: (id) => setRoot(id),
  openParent: (id) => setRoot(id),
  swapRecipe: (id) => {
    const count = model.recipesFor(id).length;
    choice.set(id, ((choice.get(id) ?? 0) + 1) % count);
    // le bilan suit la recette choisie (§5.3)
    renderAll();
    save();
  },
});

// ------------------------------------------------------------------- rendu

function renderTree(): void {
  tree.render({ root, expanded, choice, highlighted, availability });
}

function renderAll(): void {
  renderTree();
  summary.render(root, choice, highlighted, expanded, availability);
}

function setRoot(id: ItemId): void {
  root = id;
  expanded = new Set([id]);      // changer de racine réinitialise le dépli (§5.3)
  highlighted = null;
  updateHeader();
  list.setCurrent(id);
  renderAll();
  canvas.recenter();
  save();
}

function setHighlight(id: ItemId): void {
  highlighted = highlighted === id ? null : id;
  renderAll();
}

function updateHeader(): void {
  const item = model.item(root);
  document.getElementById("currentName")!.textContent = item.name;
  const link = document.getElementById("wikiLink") as HTMLAnchorElement;
  link.href = WIKI + encodeURIComponent(item.wikiTitle);
  link.title = `Ouvrir ${item.name} sur abioticfactor.wiki.gg`;
}

// ---------------------------------------------------------------- actions

document.getElementById("expandAll")!.addEventListener("click", () => {
  expanded = new Set(tree.expandablePaths({ root, expanded, choice, highlighted, availability }));
  renderAll();
  canvas.recenter();
  save();
});

document.getElementById("collapseAll")!.addEventListener("click", () => {
  expanded = new Set([root]);
  renderAll();
  canvas.recenter();
  save();
});

document.getElementById("recenter")!.addEventListener("click", () => {
  canvas.recenter();
  save();
});

// ------------------------------------------------------------ persistance

function save(): void {
  const session: Session = {
    root,
    expanded: [...expanded],
    choice: [...choice],
    view: canvas.getView(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // stockage indisponible (navigation privée) : la session ne survit pas, tant pis
  }
}

function restore(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    // toute racine est valable, y compris un objet non craftable ouvert
    // depuis une ligne « à ramasser » ou une feuille de l'arbre
    return model.has(session.root) ? session : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- démarrage

const session = restore();
if (session) {
  root = session.root;
  expanded = new Set(session.expanded);
  choice = new Map(session.choice);
}

updateHeader();
list.setCurrent(root);
renderAll();

if (session) canvas.setView(session.view);
else canvas.recenter();
