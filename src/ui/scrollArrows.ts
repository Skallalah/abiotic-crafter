/**
 * Les flèches d'ascenseur Windows 98, en vrais boutons.
 *
 * `::-webkit-scrollbar-button` n'est plus peint par Chromium (ère des
 * ascenseurs « Fluent »), et Firefox n'a jamais su dessiner de flèches :
 * le CSS seul ne peut pas rendre les boutons ▲▼ d'époque. Ceux-ci sont donc
 * de vrais boutons, posés aux extrémités de la colonne de défilement — et du
 * coup ils fonctionnent : clic = un pas, maintien = répétition, comme en 98.
 *
 * Seul le thème win98 les affiche (CSS) ; ils disparaissent quand le contenu
 * tient sans défiler, comme la barre elle-même.
 */

/** Un pas de flèche, en pixels — trois lignes de liste, comme à l'époque. */
const STEP = 48;
/** Cadence de répétition pendant le maintien. */
const REPEAT_MS = 66;

function arrow(container: HTMLElement, direction: -1 | 1): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sb-arrow ${direction < 0 ? "sb-up" : "sb-down"}`;
  button.tabIndex = -1;                       // la molette et le clavier savent déjà
  button.setAttribute("aria-hidden", "true");

  let timer = 0;
  const step = () => container.scrollBy({ top: direction * STEP });
  const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();                   // ne pas voler le focus
    step();
    timer = window.setInterval(step, REPEAT_MS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"] as const) {
    button.addEventListener(type, stop);
  }
  return button;
}

/**
 * Pose ▲ et ▼ sur `host`, alignés sur la colonne de défilement de
 * `container`. `host` doit être un ancêtre positionné qui ne défile pas
 * (le `.pane` pour une colonne, la `.winbox` pour une fenêtre) — des boutons
 * dans le conteneur partiraient avec le contenu.
 */
export function armScrollArrows(container: HTMLElement, host: HTMLElement): void {
  const up = arrow(container, -1);
  const down = arrow(container, 1);
  host.append(up, down);

  const place = () => {
    const overflow = container.scrollHeight > container.clientHeight + 1;
    up.hidden = down.hidden = !overflow;
    if (!overflow) return;
    const box = container.getBoundingClientRect();
    const ref = host.getBoundingClientRect();
    up.style.top = `${box.top - ref.top}px`;
    down.style.top = `${box.bottom - ref.top - 16}px`;
    up.style.right = down.style.right = `${ref.right - box.right}px`;
  };

  place();
  window.addEventListener("resize", place);
  // le contenu change sans résize : recherche qui filtre, fenêtre re-rendue
  new MutationObserver(place).observe(container, { childList: true, subtree: true });
  // et le conteneur lui-même change de taille : fenêtre WinBox redimensionnée
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(place).observe(container);
  }
}
