import { beforeEach, describe, expect, it, vi } from "vitest";
import { armRetrobar, needsRetrobar } from "./retrobar";

beforeEach(() => { document.body.innerHTML = ""; });

describe("l'ascenseur Firefox reconstruit", () => {
  it("ne s'arme que là où le CSS -moz est compris (jamais en jsdom)", () => {
    expect(needsRetrobar()).toBe(false);
    const host = document.createElement("div");
    armRetrobar(document.createElement("div"), host);
    expect(host.querySelector(".retrobar")).toBeNull();
  });

  it("forcé : pose le rail, caché tant que rien ne déborde", () => {
    const host = document.createElement("div");
    const container = document.createElement("div");
    host.appendChild(container);
    document.body.appendChild(host);
    armRetrobar(container, host, true);
    const rail = host.querySelector<HTMLElement>(".retrobar")!;
    expect(rail.hidden).toBe(true);       // jsdom : scrollHeight = clientHeight = 0
    expect(rail.querySelector(".rb-up")).toBeTruthy();
    expect(rail.querySelector(".rb-track .rb-thumb")).toBeTruthy();
    expect(rail.querySelector(".rb-down")).toBeTruthy();
  });

  it("les flèches défilent le conteneur, avec répétition au maintien", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    const container = document.createElement("div");
    host.appendChild(container);
    document.body.appendChild(host);
    const moves: number[] = [];
    (container as unknown as { scrollBy: (o: { top: number }) => void }).scrollBy =
      (o) => moves.push(o.top);
    armRetrobar(container, host, true);
    const down = host.querySelector<HTMLButtonElement>(".rb-down")!;
    down.dispatchEvent(new Event("pointerdown"));
    expect(moves).toEqual([48]);
    vi.advanceTimersByTime(200);
    expect(moves.length).toBeGreaterThan(2);
    down.dispatchEvent(new Event("pointerup"));
    const settled = moves.length;
    vi.advanceTimersByTime(200);
    expect(moves.length).toBe(settled);   // le maintien s'arrête au relâché
    vi.useRealTimers();
  });
});
