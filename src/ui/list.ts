import type { Model } from "../core/tree";
import type { ItemId } from "../data/types";
import { badges, fold, tile } from "./format";

/**
 * Colonne de gauche : les items craftables, groupés par catégorie.
 *
 * Le mockup ne groupe pas ; avec ~600 craftables une liste plate est
 * inutilisable, d'où l'intertitre par catégorie exigé au §5.2.
 */
export class ItemList {
  private readonly ul: HTMLUListElement;
  private readonly input: HTMLInputElement;
  private readonly craftables: ItemId[];
  private current: ItemId | null = null;

  constructor(
    private readonly model: Model,
    private readonly onPick: (id: ItemId) => void,
  ) {
    this.ul = document.getElementById("itemlist") as HTMLUListElement;
    this.input = document.getElementById("search") as HTMLInputElement;

    this.craftables = Object.keys(model.ds.items)
      .filter((id) => model.isCraftable(id))
      .sort((a, b) => model.item(a).name.localeCompare(model.item(b).name, "en"));

    this.input.addEventListener("input", () => this.render());
    document.addEventListener("keydown", (e) => this.onKey(e));
  }

  private onKey(event: KeyboardEvent): void {
    const typing = document.activeElement === this.input;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      this.input.focus();
      this.input.select();
    } else if (event.key === "Escape" && typing) {
      this.input.value = "";
      this.render();
    }
  }

  /**
   * Marque l'objet courant et s'assure qu'on le voie.
   *
   * On arrive ici aussi par un lien montant, sur un objet que le filtre en
   * cours peut très bien exclure : sans ça la liste n'aurait plus aucune
   * entrée active et le lien ne se comporterait pas « comme un clic à gauche ».
   * Le filtre n'est vidé que s'il cache effectivement l'objet.
   */
  setCurrent(id: ItemId): void {
    this.current = id;
    // La racine peut être un objet non craftable, ouvert depuis l'arbre ou une
    // ligne « à ramasser » : il n'a alors aucune entrée ici, et vider le filtre
    // ne servirait qu'à perdre la recherche en cours.
    const listed = this.craftables.includes(id);
    const query = fold(this.input.value.trim());
    if (listed && query && !this.haystack(id).includes(query)) this.input.value = "";
    this.render();
    if (listed) this.ul.querySelector("button.active")?.scrollIntoView({ block: "nearest" });
  }

  render(): void {
    const query = fold(this.input.value.trim());
    const matches = query
      ? this.craftables.filter((id) => this.haystack(id).includes(query))
      : this.craftables;

    this.ul.replaceChildren();

    if (matches.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = `No craftable item matches "${this.input.value.trim()}".`;
      this.ul.appendChild(li);
      return;
    }

    const byCategory = new Map<string, ItemId[]>();
    for (const id of matches) {
      const category = this.model.item(id).category;
      const list = byCategory.get(category);
      if (list) list.push(id);
      else byCategory.set(category, [id]);
    }

    const fragment = document.createDocumentFragment();
    for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b, "en"))) {
      const header = document.createElement("li");
      const title = document.createElement("div");
      title.className = "group";
      title.textContent = category;
      header.appendChild(title);
      fragment.appendChild(header);

      for (const id of byCategory.get(category)!) fragment.appendChild(this.entry(id));
    }
    this.ul.appendChild(fragment);
  }

  /**
   * Texte interrogé par la recherche : le nom, plus l'emplacement de gear.
   *
   * Le wiki nomme la tier 6 des hacking devices « Gatekey (Tier 6) » : sans le
   * gearSlot, « hacking » ne remonterait que les cinq Keypad Hacker et
   * manquerait le dernier maillon de la même famille.
   */
  private haystack(id: ItemId): string {
    const item = this.model.item(id);
    return fold(item.gearSlot ? `${item.name} ${item.gearSlot}` : item.name);
  }

  private entry(id: ItemId): HTMLLIElement {
    const item = this.model.item(id);
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.item = id;
    if (id === this.current) button.classList.add("active");

    const name = document.createElement("span");
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.appendChild(badges(this.model, id));

    button.append(tile(this.model, item), name, meta);
    button.addEventListener("click", () => this.onPick(id));
    li.appendChild(button);
    return li;
  }
}
