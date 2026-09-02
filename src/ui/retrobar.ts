/**
 * L'ascenseur Windows 98 de Firefox, reconstruit en DOM.
 *
 * Chrome dessine le vrai : `::-webkit-scrollbar` + boutons, il ne passe
 * jamais ici. Firefox, lui, ne sait NI flèches, NI trame, NI largeur
 * d'époque — ses barres natives restent un fil overlay quoi qu'on colore
 * (98.css ne tente même pas). On masque donc sa barre (`scrollbar-width:
 * none`, dans le bloc @supports -moz du thème) et on pose un rail complet :
 * ▲, piste tramée, pouce en relief draggable, ▼. Le thème win98 seul le
 * peint ; ailleurs il reste `display: none` et ne gêne pas.
 */

/** Un pas de flèche — trois lignes de liste, comme à l'époque. */
const STEP = 48;
const REPEAT_MS = 66;
/** Le pouce ne descend jamais sous cette taille, sinon on ne l'attrape plus. */
const MIN_THUMB = 20;

/** Firefox seulement : le même discriminant que le CSS. */
export function needsRetrobar(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("selector(::-moz-range-thumb)");
}

function repeatable(button: HTMLElement, step: () => void): void {
  let timer = 0;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    step();
    timer = window.setInterval(step, REPEAT_MS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) {
    button.addEventListener(type, () => { if (timer) clearInterval(timer); timer = 0; });
  }
}

/**
 * Pose le rail sur `host` (un ancêtre positionné qui ne défile pas : le
 * `.pane` d'une colonne, la `.winbox` d'une fenêtre) et le synchronise avec
 * `container`, l'élément qui défile. `force` sert aux tests.
 */
export function armRetrobar(container: HTMLElement, host: HTMLElement,
                            force = false): void {
  if (!force && !needsRetrobar()) return;

  const rail = document.createElement("div");
  rail.className = "retrobar";
  const up = document.createElement("button");
  up.type = "button";
  up.className = "rb-up";
  up.tabIndex = -1;
  const track = document.createElement("div");
  track.className = "rb-track";
  const thumb = document.createElement("div");
  thumb.className = "rb-thumb";
  const down = document.createElement("button");
  down.type = "button";
  down.className = "rb-down";
  down.tabIndex = -1;
  track.appendChild(thumb);
  rail.append(up, track, down);
  rail.setAttribute("aria-hidden", "true");
  host.appendChild(rail);

  const overflow = () => container.scrollHeight - container.clientHeight;

  const sync = () => {
    if (overflow() <= 1) {
      rail.hidden = true;
      return;
    }
    rail.hidden = false;
    // offsets plutôt que rects : relatifs à l'hôte (offsetParent), stables
    // même si la mesure part avant que polices et images ne soient posées
    rail.style.top = `${container.offsetTop}px`;
    rail.style.height = `${container.offsetHeight}px`;
    rail.style.right =
      `${host.clientWidth - container.offsetLeft - container.offsetWidth}px`;
    const trackH = track.clientHeight;
    const thumbH = Math.max(MIN_THUMB,
      Math.round(trackH * container.clientHeight / container.scrollHeight));
    const range = trackH - thumbH;
    thumb.style.height = `${thumbH}px`;
    thumb.style.top = `${Math.round(range * container.scrollTop / overflow())}px`;
  };

  repeatable(up, () => container.scrollBy({ top: -STEP }));
  repeatable(down, () => container.scrollBy({ top: STEP }));

  // cliquer la piste = une page, comme le vrai
  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const below = event.offsetY > thumb.offsetTop;
    container.scrollBy({ top: (below ? 1 : -1) * container.clientHeight });
  });

  // glisser le pouce
  thumb.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startTop = container.scrollTop;
    const range = track.clientHeight - thumb.clientHeight;
    const move = (ev: PointerEvent) => {
      if (range > 0) {
        container.scrollTop = startTop + (ev.clientY - startY) * overflow() / range;
      }
    };
    const done = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", done);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", done);
  });

  container.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("load", sync);
  new MutationObserver(sync).observe(container, { childList: true, subtree: true });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(sync).observe(container);
  sync();
  requestAnimationFrame(sync);
}
