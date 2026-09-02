/**
 * L'ascenseur Windows 98, reconstruit en DOM — LE composant, tous navigateurs.
 *
 * Il n'existe aucun moyen commun de dessiner une scrollbar en CSS : Firefox
 * refuse `::-webkit-scrollbar` par choix (bugs Mozilla 1432935 / 1460109) et
 * n'offre que deux couleurs sans flèches ni trame. Plutôt que d'entretenir
 * deux rendus du même composant (webkit chez Chrome, DOM chez Firefox), la
 * barre native est masquée partout en win98 (`scrollbar-width: none`,
 * standard des deux moteurs) et ce rail la remplace : ▲, piste tramée où
 * cliquer vaut une page, pouce en relief draggable, ▼ — l'approche des
 * bibliothèques du genre (SimpleBar, OverlayScrollbars). Le thème win98 seul
 * le peint ; ailleurs il reste `display: none` et ne gêne pas.
 */

/** Un pas de flèche — trois lignes de liste, comme à l'époque. */
const STEP = 48;
const REPEAT_MS = 66;
/** Le pouce ne descend jamais sous cette taille, sinon on ne l'attrape plus. */
const MIN_THUMB = 20;

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
 * `container`, l'élément qui défile.
 */
export function armRetrobar(container: HTMLElement, host: HTMLElement): void {
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

  // `smooth` : la barre native de Chrome anime ses pas, le rail aussi
  repeatable(up, () => container.scrollBy({ top: -STEP, behavior: "smooth" }));
  repeatable(down, () => container.scrollBy({ top: STEP, behavior: "smooth" }));

  // cliquer la piste = une page, comme le vrai
  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb) return;
    const below = event.offsetY > thumb.offsetTop;
    container.scrollBy({
      top: (below ? 1 : -1) * container.clientHeight,
      behavior: "smooth",
    });
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
