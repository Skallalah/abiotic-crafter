import { describe, expect, it } from "vitest";
import { dataset } from "../data/load";
import { Model, type RecipeChoice } from "./tree";
import { computeTotals, craftOrder } from "./totals";
import { computeAvailability, frontier } from "./discovery";
import { groupByZone } from "./zones";
import { fold } from "../ui/format";

/** Tests sur les vraies données scrapées, pas sur un fixture. */

const model = new Model(dataset);
const NO_CHOICE: RecipeChoice = new Map();

describe("dataset scrapé", () => {
  it("résout tous les ingrédients de toutes les recettes", () => {
    const missing: string[] = [];
    for (const recipe of dataset.recipes) {
      if (!model.has(recipe.output.item)) missing.push(recipe.output.item);
      for (const input of recipe.inputs) {
        if (!model.has(input.item)) missing.push(input.item);
      }
    }
    expect(missing).toEqual([]);
  });

  it("donne à chaque item une catégorie et un stack valides", () => {
    for (const item of Object.values(dataset.items)) {
      expect(item.category).toBeTruthy();
      expect(item.stack).toBeGreaterThanOrEqual(1);
    }
  });

  it("n'attribue un primary qu'aux items réellement duals", () => {
    for (const [id, item] of Object.entries(dataset.items)) {
      if (item.primary) expect(model.isDual(id)).toBe(true);
    }
  });

  it("termine le bilan de chaque craftable sans exploser", () => {
    for (const id of Object.keys(dataset.items)) {
      if (model.isCraftable(id)) expect(() => computeTotals(model, id, NO_CHOICE)).not.toThrow();
    }
  });
});

describe("Keypad Hacker — bilan de référence du mockup (§8)", () => {
  const totals = computeTotals(model, "keypad_hacker", NO_CHOICE);

  it("retrouve les ressources de base du mockup", () => {
    expect(Object.fromEntries(totals.base)).toEqual({
      circuit_board: 10, tech_scrap: 6, metal_scrap: 4, security_bot_cpu: 3,
      case_fan: 3, keyboard: 2, desk_phone: 2, glass_scrap: 2,
      test_tube: 1, bio_scrap: 1,
    });
  });

  it("retrouve les crafts intermédiaires du mockup", () => {
    expect(Object.fromEntries(totals.steps)).toEqual({
      computation_brick: 3, box_of_screws: 2, glowstick: 1, controller: 1,
      lcd_screen: 1, infrared_emitter: 1, keypad_hacker: 1,
    });
  });

  it("place le Keypad Hacker en dernier de l'ordre de craft", () => {
    expect(craftOrder(totals).at(-1)).toBe("keypad_hacker");
  });

  it("range chaque ressource de base dans au moins une zone", () => {
    const groups = groupByZone(model, totals);
    const placed = new Set(groups.flatMap((g) => g.entries.map((e) => e.id)));
    for (const id of totals.base.keys()) expect(placed).toContain(id);
  });

  it("compte un tier replié comme un objet entier à se procurer", () => {
    // le cas demandé : sur le hacker tier 2, tier 1 non déplié apparaît dans
    // les requis comme un objet à récupérer, pas décomposé
    const racine = "keypad_hacker_tier_2";
    const { base, steps } = computeTotals(model, racine, NO_CHOICE, 1, new Set([racine]));
    expect(base.get("keypad_hacker")).toBe(1);
    expect(base.has("controller")).toBe(false);
    expect(Object.keys(Object.fromEntries(steps))).toEqual([racine]);

    // et une fois déplié, il redevient une étape de craft
    const deplie = computeTotals(
      model, racine, NO_CHOICE, 1,
      new Set([racine, `${racine}/keypad_hacker`]),
    );
    expect(deplie.steps.get("keypad_hacker")).toBe(1);
    expect(deplie.base.has("keypad_hacker")).toBe(false);
    expect(deplie.base.get("controller")).toBe(1);
  });
});

describe("dérivations sur les données réelles", () => {
  const zones = new Set(dataset.zones.map((z) => z.name.toLowerCase()));

  it("résout chaque `from` vers un item du dataset", () => {
    const casses = Object.values(dataset.items).flatMap((item) =>
      item.sources.filter((s) => s.from && !model.has(s.from))
        .map((s) => `${item.name} → ${s.from}`),
    );
    expect(casses).toEqual([]);
  });

  it("n'accepte jamais l'item lui-même ni une zone comme origine", () => {
    // Un établi n'est pas exclu ici : « Crafting Bench » est aussi un item du
    // jeu, et le wiki dit bien qu'en le démontant on récupère une Power Supply
    // Unit. Seule la prose ambiguë (« salvaging X at a [[Repair and Salvage
    // Station]] ») écarte les établis, côté scraper.
    const fautifs: string[] = [];
    for (const [id, item] of Object.entries(dataset.items)) {
      for (const s of item.sources) {
        if (!s.from) continue;
        if (s.from === id) fautifs.push(`${item.name} est sa propre origine`);
        const nom = model.has(s.from) ? model.item(s.from).name.toLowerCase() : "";
        if (zones.has(nom)) fautifs.push(`${item.name} ← zone ${nom}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("décode les entités HTML des noms venus de Cargo", () => {
    const echappes = Object.values(dataset.items)
      .filter((i) => /&#\d+;|&[a-z]+;/.test(i.name))
      .map((i) => i.name);
    expect(echappes).toEqual([]);
  });

  it("mène de la Canister au lieu de spawn de l'extincteur", () => {
    // le cas qui a motivé la fonctionnalité : « il me dit juste extincteur »
    expect(model.isDerived("canister")).toBe(true);
    const [collect] = model.collectibles("canister");
    expect(collect!.origin).toBe("fire_extinguisher");
    expect(collect!.sources.map((s) => s.zone)).toContain("Manufacturing West");

    const totals = computeTotals(model, "canister", NO_CHOICE);
    const groups = groupByZone(model, totals);
    const mw = groups.find((g) => g.name === "Manufacturing West");
    expect(mw?.entries.find((e) => e.id === "canister")?.via?.origin)
      .toBe("fire_extinguisher");
  });

  it("lit tous les lieux de la section == Locations == d'une page", () => {
    // la page du Fire Extinguisher en cite quatre ; la liste de la page
    // Manufacturing West n'en connaissait qu'un
    const zones = model.item("fire_extinguisher").sources
      .map((s) => s.zone)
      .filter(Boolean);
    expect(new Set(zones)).toEqual(new Set([
      "Manufacturing West", "Cascade Laboratories", "The Train", "Fragments",
    ]));
  });

  it("propage les quatre lieux de l'extincteur sur la Canister", () => {
    const totals = computeTotals(model, "canister", NO_CHOICE);
    const zones = groupByZone(model, totals)
      .filter((g) => g.entries.some((e) => e.id === "canister" && e.via))
      .map((g) => g.name);
    expect(new Set(zones)).toEqual(new Set([
      "Manufacturing West", "Cascade Laboratories", "The Train", "Fragments",
    ]));
  });

  it("ordonne les mondes-portails juste après leur secteur parent", () => {
    const byName = new Map(dataset.zones.map((z) => [z.name, z]));
    const train = byName.get("The Train")!;
    expect(train.parent).toBe("Manufacturing West");
    expect(train.order).toBeGreaterThan(byName.get("Manufacturing West")!.order);
    expect(train.order).toBeLessThan(byName.get("Cascade Laboratories")!.order);
  });

  it("garde les bornes de quantité, min compris", () => {
    // amountMin vaut 0 sur 46 des 116 lignes Loot : ne stocker que le max
    // effacerait la différence entre une source sûre et un coup de chance
    const bornes = Object.values(dataset.items).flatMap((i) => i.sources)
      .filter((s) => s.qtyMax !== undefined);
    expect(bornes.length).toBeGreaterThan(400);
    expect(bornes.some((s) => s.qtyMin === 0)).toBe(true);

    const incoherentes = bornes.filter(
      (s) => s.qtyMin === undefined || s.qtyMin > s.qtyMax!,
    );
    expect(incoherentes).toEqual([]);
  });

  it("garde la quantité sur chaque secteur où le même objet est listé", () => {
    // la Manufacturing Wood Crate est listée dans deux secteurs ; l'élagage des
    // sources redondantes perdait la quantité sur tous sauf le premier
    const caisses = model.item("box_of_screws").sources
      .filter((s) => s.target === "Manufacturing Wood Crate");
    expect(caisses.length).toBeGreaterThan(1);
    for (const source of caisses) {
      expect(source.zone).toBeTruthy();
      expect([source.qtyMin, source.qtyMax]).toEqual([0, 3]);
    }
  });

  it("garde les emplacements séparés au lieu d'un pavé", () => {
    // le wiki liste sept lieux pour le Hose dans Office Sector, sous une
    // sous-zone « Level 2 » ; les joindre donnait « Level 2 Area under the… »
    const office = model.item("hose").sources.find((s) => s.zone === "Office Sector");
    expect(office?.where).toHaveLength(7);
    expect(office!.where!.every((w) => w.startsWith("Level 2 › "))).toBe(true);
    expect(office!.where![3]).toBe("Level 2 › Bio Lab D.");
  });

  it("ne laisse aucun balisage wiki dans les emplacements", () => {
    // « ===Office Sector=== Level 2 * Kitchen » et « {{spoiler|…} » s'affichaient
    const sales = Object.values(dataset.items)
      .flatMap((i) => i.sources.flatMap((s) => s.where ?? []))
      .filter((w) => /===|\{\{|\[\[|\]\]|<[a-z]/.test(w));
    expect(sales).toEqual([]);
  });

  it("lit les zones même quand elles sont sous == Sources ==", () => {
    // cinq pages font ça ; une seule de leurs sept zones était retenue
    const zones = model.item("cooking_pot").sources
      .map((s) => s.zone)
      .filter(Boolean);
    expect(new Set(zones).size).toBeGreaterThanOrEqual(7);
    expect(zones).toContain("Flathill");
  });

  it("rattache les gros ingrédients dérivés à une origine nommée", () => {
    for (const id of ["fisherman_s_glue", "solder_material", "exquisite_chain"]) {
      if (!model.has(id)) continue;
      expect(model.collectibles(id).length).toBeGreaterThan(0);
    }
  });
});

describe("recherche (§8)", () => {
  const search = (query: string) =>
    Object.values(dataset.items)
      .filter((i) => model.isCraftable(i.id))
      .filter((i) => fold(i.gearSlot ? `${i.name} ${i.gearSlot}` : i.name).includes(fold(query)))
      .map((i) => i.name)
      .sort();

  it("remonte les cinq Keypad Hacker sur « hacker »", () => {
    expect(search("hacker")).toEqual([
      "Keypad Hacker", "Keypad Hacker (Tier 2)", "Keypad Hacker (Tier 3)",
      "Keypad Hacker (Tier 4)", "Keypad Hacker (Tier 5)",
    ]);
  });

  it("réunit toute la famille, Gatekey compris, sur « hacking »", () => {
    // le wiki nomme la tier 6 « Gatekey (Tier 6) » : seul le gearSlot les relie
    expect(search("hacking")).toContain("Gatekey (Tier 6)");
    expect(search("hacking")).toHaveLength(6);
  });

  it("ignore les accents et la casse", () => {
    expect(search("KEYPAD HACKER")).toHaveLength(5);
  });
});


describe("contenants et créatures", () => {
  it("donne une fenêtre à la Manufacturing Wood Crate, image comprise", () => {
    // le cas qui motive la fonctionnalité : « break Manufacturing Wood Crate »
    // ne disait ni à quoi elle ressemble, ni où elle est, ni ce qu'elle contient
    const crate = model.provider("manufacturing_wood_crate")!;
    expect(crate).toBeDefined();
    expect(crate.icon).toBeTruthy();
    expect(crate.zones.map((z) => z.zone)).toContain("Manufacturing West");
    expect(crate.drops.map((d) => d.item)).toContain("box_of_screws");
  });

  it("récupère les caisses absentes de Cargo par le tableau de leur page", () => {
    // Office Wood Crate n'a aucune ligne Loot ni LootTables
    const crate = model.provider("office_wood_crate")!;
    expect(crate.drops.length).toBeGreaterThan(4);
    expect(crate.zones.length).toBeGreaterThan(0);
  });

  it("porte les chances que seul LootTablesItems connaît", () => {
    const chances = model.provider("toolbox")!.drops.map((d) => d.chance);
    expect(chances.every((c) => c !== undefined)).toBe(true);
    expect(Math.max(...chances as number[])).toBeLessThanOrEqual(1);
  });

  it("distingue ce qu'une créature lâche de ce qu'on récolte sur elle", () => {
    const pest = model.provider("pest")!;
    expect(pest.kind).toBe("enemy");
    expect(pest.drops.every((d) => d.via === "drop" || d.via === "harvest")).toBe(true);
  });

  it("ne référence que des items du dataset dans les contenus", () => {
    const missing: string[] = [];
    for (const provider of Object.values(dataset.providers)) {
      for (const drop of provider.drops) {
        if (!model.has(drop.item)) missing.push(`${provider.id} → ${drop.item}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ne pose targetId que sur une cible qui a vraiment une fenêtre", () => {
    const broken: string[] = [];
    let linked = 0;
    for (const item of Object.values(dataset.items)) {
      for (const source of item.sources) {
        if (!source.targetId) continue;
        linked += 1;
        if (!model.hasProvider(source.targetId)) broken.push(`${item.id} → ${source.targetId}`);
      }
    }
    expect(broken).toEqual([]);
    expect(linked).toBeGreaterThan(500);
  });

  it("range chaque emplacement sous sa propre zone", () => {
    // Le Computer est le cas qui l'a montré : douze emplacements dans sept
    // secteurs, mis à plat, « Vehicle Lot 07 » suivait « Botanical Wing » sans
    // que rien ne dise lequel était où.
    const zones = new Map(
      model.provider("computer")!.zones.map((z) => [z.zone, z.where ?? []]),
    );
    expect(zones.get("Cascade Laboratories")!.join(" ")).toContain("Vehicle Lot 07");
    expect(zones.get("Fragments")!.join(" ")).toContain("Botanical Wing");
    expect(zones.get("Office Sector")!.join(" ")).not.toContain("Botanical Wing");
  });

  it("ne répète pas un emplacement à l'intérieur d'une zone", () => {
    // À l'inverse, la même phrase dans deux zones est légitime : la page du
    // Medkit dit « Throughout the location. » sous quatre secteurs.
    for (const provider of Object.values(dataset.providers)) {
      for (const zone of provider.zones) {
        const spots = zone.where ?? [];
        expect(new Set(spots).size, `${provider.id} / ${zone.zone}`).toBe(spots.length);
      }
    }
  });

  it("ne garde aucun contenant qui n'aurait rien à montrer", () => {
    for (const provider of Object.values(dataset.providers)) {
      const empty = provider.drops.length === 0 && !provider.icon
        && provider.zones.length === 0;
      expect(empty, provider.id).toBe(false);
    }
  });
});


describe("zones", () => {
  it("donne à chaque secteur sa pastille et sa couleur", () => {
    for (const name of ["Office Sector", "Manufacturing West", "Cascade Laboratories",
                        "Hydroplant", "Security Sector", "Reactors"]) {
      const zone = model.zone(name)!;
      expect(zone.icon, name).toBeTruthy();
      expect(zone.color, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("tire la couleur de la pastille, elle n'est jamais choisie à la main", () => {
    // une zone sans image ne peut pas avoir de couleur : les deux vont ensemble
    for (const zone of dataset.zones) {
      if (zone.color) expect(zone.icon, zone.name).toBeTruthy();
    }
  });

  it("donne une pastille et une couleur à toutes les zones", () => {
    // les seules zones qui en manquaient étaient des redirections du wiki,
    // désormais fondues dans leur cible (canonical_zone)
    expect(dataset.zones.filter((z) => !z.icon)).toEqual([]);
    expect(dataset.zones.filter((z) => !z.color)).toEqual([]);
    expect(dataset.zones.map((z) => z.name))
      .not.toContain("Mycofields");
  });
});


describe("découverte (§5.7), sur les vraies données", () => {
  const state = (...zones: string[]) => ({ enabled: true, zones: new Set(zones) });

  it("relie Office Sector à ses six secteurs", () => {
    expect(model.zone("Office Sector")!.links).toEqual([
      "Manufacturing West", "Cascade Laboratories", "Security Sector",
      "Hydroplant", "Reactors", "Residence Sector",
    ]);
  });

  it("ouvre la bonne frontière depuis le début du jeu", () => {
    const entries = frontier(model, state("Office Sector"));
    const named = entries.filter((f) => !f.uncharted).map((f) => f.zone).sort();
    expect(named).toEqual([
      "Cascade Laboratories", "Far Garden", "Flathill", "Hydroplant",
      "Manufacturing West", "Reactors", "Residence Sector", "Security Sector",
    ]);
    // les lieux que rien ne relie restent proposés, à part — les zones
    // fantômes (Mycofields, Power Services, Divarication) étaient des
    // redirections du wiki, fondues dans leur zone réelle
    expect(entries.filter((f) => f.uncharted).map((f) => f.zone).sort()).toEqual([
      "North Pole", "Temple of Stone",
    ]);
  });

  it("atteint The Encroachment malgré son lien déclaré en sens unique", () => {
    const entries = frontier(model, state("Manufacturing West"));
    expect(entries.map((f) => f.zone)).toContain("The Encroachment");
  });

  it("filtre vraiment avec Office seul, sans vider l'app", () => {
    const availability = computeAvailability(model, state("Office Sector"));
    const craftables = Object.keys(dataset.items).filter((id) => model.isCraftable(id));
    const visible = craftables.filter((id) => availability.item(id)).length;
    // ~150 après la série de corrections de fuites ; on borne sans figer
    expect(visible).toBeGreaterThan(100);
    expect(visible).toBeLessThan(350);
    expect(visible).toBeLessThan(craftables.length);
  });

  it("ne rend pas l'Energy Pistol atteignable avec Office, Flathill et Far Garden", () => {
    // le cas rapporté : Capacitor passait par un Power Leech sans zone,
    // Military Electronics par des soldats de l'Order jamais localisés,
    // Night Essence par un poisson — et la recette semblait complète
    const availability = computeAvailability(
      model, state("Office Sector", "Flathill", "Far Garden"));
    for (const id of ["energy_pistol", "capacitor", "night_essence",
                      "military_electronics", "magbow", "carapace_helm",
                      "raw_stuffed_mushroom_tray", "electro_pest_item",
                      "giganto_tincture", "acid_coating", "holy_coating",
                      "lodestone_fragment", "hexwood"]) {
      expect(availability.item(id), id).toBe(false);
    }
    // la feuille inconnue de la même chaîne reste visible : « Pest (Pet) »
    // n'existe pas dans la donnée, cacher Pest (Item) serait arbitraire
    expect(availability.item("pest_item")).toBe(true);
    // et l'Energy Pistol redevient atteignable là où vivent vraiment les leechs
    const later = computeAvailability(
      model, state("Office Sector", "Cascade Laboratories"));
    expect(later.item("capacitor")).toBe(true);
  });

  it("suit les améliorations : l'A.E.G.I.S. n'est plus « jamais localisable »", () => {
    const availability = computeAvailability(model, state("Office Sector"));
    expect(availability.item("a_e_g_i_s_helmet")).toBe(false);
  });

  it("relie la cuisine par les colonnes cooking*/decay de la table Items", () => {
    // Raw Stuffed Mushroom Tray ← Anteverse Cheese ← meule ← curds ← soupe :
    // la chaîne n'existait qu'en prose muette, les colonnes Cargo la déclarent
    const wheel = model.item("ripening_alien_cheese_wheel");
    expect(wheel.sources.some((s) => s.from === "alien_cheese_curds")).toBe(true);
    const cheese = model.item("anteverse_cheese");
    expect(cheese.sources.some((s) => s.from === "alien_cheese_wheel")).toBe(true);
  });

  it("distingue un drop conditionnel d'un drop ordinaire du même rat", () => {
    // la table du Lab Rat : « Lodestone Fragment — Completing Canaan… » est
    // une condition, « Black Gunk ×2 » un drop ordinaire. Et les rats
    // n'arrivent qu'avec Manufacturing (delayedPresence, cf. overrides).
    const availability = computeAvailability(
      model, state("Office Sector", "Manufacturing West"));
    expect(availability.item("black_gunk")).toBe(true);
    expect(availability.item("lodestone_fragment")).toBe(false);
    const rat = model.provider("lab_rat")!;
    const ids = rat.drops.map((d) => d.item);
    expect(new Set(ids).size).toBe(ids.length);   // plus de lignes en double
    expect(rat.drops.find((d) => d.item === "lodestone_fragment")!.chanceText)
      .toContain("Completing");
  });

  it("ne prête pas à la Peccary Sow le lieu d'une conséquence en sous-puce", () => {
    // « ** After completing the Furniture Store multiple Zombies spawn… »
    // décrivait des zombies, pas un lieu de vie de la truie
    const sow = model.provider("peccary_sow")!;
    expect(sow.zones.some((z) => z.zone === "Furniture Store")).toBe(false);
    expect(sow.zones.some((z) => z.zone === "Cascade Laboratories")).toBe(true);
  });

  it("retarde le Symphonist : il n'apparaît qu'après avoir complété Flathill", () => {
    // sa propre page le dit ; l'infobox de Flathill le liste sans ce timing.
    // Le retard se lève à la découverte de Flathill (`until`) — le suivi ne
    // sait pas mesurer « complété », découvrir la zone est la meilleure borne
    expect(model.provider("symphonist")!.zones)
      .toEqual([{ zone: "Flathill", requires: "Flathill" }]);
    const before = computeAvailability(model, state("Office Sector"));
    expect(before.provider("symphonist")).toBe(false);
    const flathill = computeAvailability(model,
      state("Office Sector", "Flathill", "Far Garden"));
    expect(flathill.provider("symphonist")).toBe(true);
    // la régression vécue : la ligne « kill Symphonist » de Porcelain Shards
    // redevient visible une fois Flathill découverte
    const kill = model.item("porcelain_shards").sources.find(
      (s) => s.kind === "drop" && s.target === "Symphonist")!;
    expect(before.source(kill)).toBe(false);
    expect(flathill.source(kill)).toBe(true);
  });

  it("retarde la présence du Lab Rat à Office : l'override delayedPresence", () => {
    // l'infobox d'Office le déclare, mais les rats n'y apparaissent qu'une
    // fois Manufacturing atteint — le wiki ne le dit qu'en prose floue
    const rat = model.provider("lab_rat")!;
    expect(rat.zones.find((z) => z.zone === "Office Sector")!.requires)
      .toBe("Manufacturing West");
    const office = computeAvailability(model, state("Office Sector"));
    expect(office.item("rat_scanner")).toBe(false);
    expect(office.provider("lab_rat")).toBe(false);
    const later = computeAvailability(model, state("Office Sector", "Manufacturing West"));
    expect(later.item("rat_scanner")).toBe(true);
    expect(later.provider("lab_rat")).toBe(true);
    // la ligne « KILL Lab Rat » d'Office attend Manufacturing pour s'afficher
    const gunk = model.item("black_gunk").sources.find(
      (s) => s.kind === "drop" && s.target === "Lab Rat" && s.zone === "Office Sector");
    expect(gunk?.requiresZone).toBe("Manufacturing West");
    expect(office.source(gunk!)).toBe(false);
    expect(later.source(gunk!)).toBe(true);
  });

  it("verrouille le contenu des caisses à clé sur la clé elle-même", () => {
    // la Cacophonous Crate est posée dans Office, mais « A Porcelain Key is
    // required to unlock and open the crate » — et la clé tombe des
    // Symphonists de Flathill. Sans le verrou, Organ et Porcelain Shards
    // « prouvaient » les armures Maestro dès le début du jeu
    expect(model.item("cacophonous_crate").unlockedBy).toBe("porcelain_key");
    const office = computeAvailability(model, state("Office Sector"));
    expect(office.item("cacophonous_crate")).toBe(true);   // la caisse se voit
    for (const id of ["organ", "porcelain_shards", "maestro_adornments",
                      "maestro_greaves", "maestro_vambraces", "maestro_casque"]) {
      expect(office.item(id), id).toBe(false);
    }
    const flathill = computeAvailability(model, state("Office Sector", "Flathill"));
    expect(flathill.item("porcelain_key")).toBe(true);
    expect(flathill.item("organ")).toBe(true);
    expect(flathill.item("maestro_casque")).toBe(true);
    // les cinq caisses verrouillées du jeu sont toutes détectées
    const locked = Object.values(dataset.items)
      .filter((i) => i.unlockedBy).map((i) => i.id).sort();
    expect(locked).toEqual(["cacophonous_crate", "gate_security_crate",
      "inquisitor_crate", "ornate_crate", "runic_crate"]);
  });

  it("ne cultive jamais une créature : récolter un cadavre est un kill", () => {
    // « harvesting the remains of an Exor » donnait un mot-clé GROW sur un
    // ennemi ; la table Enemies elle-même range ça en harvest
    for (const item of Object.values(dataset.items)) {
      for (const source of item.sources) {
        if (source.kind !== "grow" || !source.targetId) continue;
        const kind = model.provider(source.targetId)?.kind;
        expect(kind, `${item.id} → ${source.target}`).not.toBe("enemy");
        expect(kind, `${item.id} → ${source.target}`).not.toBe("butcher");
      }
    }
  });

  it("nomme le vendeur réel, son prix et son déblocage", () => {
    // les listes === Trading === des secteurs ne nomment personne ; les
    // Template:Trade/<marchand> si — Warren vend bien des Staplers
    const sale = model.item("stapler").sources
      .find((s) => s.kind === "vendor");
    expect(sale?.target).toBe("Warren Bunning");
    expect(sale?.zone).toBe("Office Sector");
    // le coût est structuré (lien cliquable), plus une phrase
    expect(sale?.costItem).toBe("raw_antefish_filet");
    expect(sale?.costQty).toBe("1");
    // et « Going through the Far Garden exit portal » gate l'offre
    expect(sale?.requiresZone).toBe("Far Garden");
    expect(sale?.where?.[0]).toContain("Unlocked:");
  });

  it("gate un échange sur sa zone de déblocage et sur sa monnaie", () => {
    // « buy Marion — Trades for 1 Tiny Gears. Unlocked: Completing The
    // Train. » comptait dès Flathill : le déblocage nomme une zone non
    // découverte, et la monnaie n'était même pas un item du dataset
    const sale = model.item("reinforced_hose").sources
      .find((s) => s.kind === "vendor")!;
    expect(sale.costItem).toBe("tiny_gears");
    expect(sale.requiresZone).toBe("The Train");
    // Tiny Gears existe désormais, avec sa vraie source
    expect(model.item("tiny_gears").sources.some((s) => s.from === "pocket_watch"))
      .toBe(true);
    // Flathill découverte ne suffit pas : la ligne ne se montre ni ne prouve
    const flathill = computeAvailability(model,
      state("Office Sector", "Flathill"));
    expect(flathill.source(sale)).toBe(false);
    const train = computeAvailability(model,
      state("Office Sector", "Flathill", "The Train"));
    expect(train.source(sale)).toBe(true);
  });

  it("localise les ventes par la page du PNJ et les créatures par leur prose", () => {
    // « trading with The Blacksmith » → Manufacturing West, via {{Person}} ;
    // la Peccary Sow → ses zones, via les puces de son == Locations ==
    const blacksmith = model.item("diode").sources
      .find((s) => s.kind === "vendor" && s.target === "The Blacksmith");
    expect(blacksmith?.zone).toBe("Manufacturing West");
    const office = computeAvailability(model, state("Office Sector"));
    expect(office.item("diode")).toBe(false);
    expect(office.provider("peccary_sow")).toBe(false);
    const later = computeAvailability(
      model, state("Office Sector", "Manufacturing West", "Cascade Laboratories"));
    // le Blacksmith est là, mais la Diode se paie en Axle Grease — introuvable
    // avant Hydroplant : sans la monnaie, l'échange ne prouve rien
    expect(later.item("diode")).toBe(false);
    expect(later.provider("peccary_sow")).toBe(true);
    const hydro = computeAvailability(model, state(
      "Office Sector", "Manufacturing West", "Cascade Laboratories", "Hydroplant"));
    expect(hydro.item("diode")).toBe(true);
  });

  it("toutes zones découvertes = l'app entière, par construction", () => {
    const all = computeAvailability(model, state(...dataset.zones.map((z) => z.name)));
    const hidden = Object.keys(dataset.items).filter((id) => !all.item(id));
    expect(hidden).toEqual([]);
  });

  it("ne range plus un monde-portail dans la cible d'une source", () => {
    // le bug qui laissait Egg sans géographie : « found in [[Rise]] » donnait
    // target=Rise au lieu de zone=Rise, faute de connaître les mondes-portails
    const zoned = new Set(dataset.zones
      .filter((z) => z.parent || z.links).map((z) => z.name));
    const wrong: string[] = [];
    for (const item of Object.values(dataset.items)) {
      for (const source of item.sources) {
        if (!source.zone && source.target && zoned.has(source.target)) {
          wrong.push(`${item.id} → ${source.target}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(model.item("egg").sources.some((s) => s.zone === "Rise")).toBe(true);
  });
});
