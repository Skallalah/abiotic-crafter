/**
 * Pan et zoom de la colonne centrale (§5.3).
 *
 * Repris du mockup : `pointermove` n'écrit qu'un `transform` sur la scène, sans
 * jamais re-render l'arbre. C'est ce qui garde un arbre de 60+ nœuds fluide.
 */
export interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

export class Canvas {
  readonly stage: HTMLElement;
  private readonly canvas: HTMLElement;
  private view: View = { x: 0, y: 0, k: 1 };
  private drag: { x: number; y: number } | null = null;

  constructor(private readonly onViewChange: (view: View) => void) {
    this.canvas = document.getElementById("canvas")!;
    this.stage = document.getElementById("stage")!;

    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", () => this.endDrag());
    this.canvas.addEventListener("pointercancel", () => this.endDrag());
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
  }

  getView(): View {
    return { ...this.view };
  }

  setView(view: View): void {
    this.view = { ...view };
    this.apply();
  }

  /** Ajuste le zoom pour faire tenir l'arbre, sans jamais agrandir (cap à 1). */
  recenter(): void {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const sw = this.stage.offsetWidth;
    const sh = this.stage.offsetHeight;
    if (sw === 0 || sh === 0) return;

    const k = Math.min(1, (cw - 40) / sw, (ch - 40) / sh);
    this.view = {
      k,
      x: (cw - sw * k) / 2,
      y: Math.max(0, (ch - sh * k) / 2 - 20),
    };
    this.apply();
  }

  private apply(): void {
    const { x, y, k } = this.view;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest(".node") || target.closest("button")) return;
    this.drag = { x: event.clientX - this.view.x, y: event.clientY - this.view.y };
    this.canvas.classList.add("dragging");
    this.canvas.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    this.view.x = event.clientX - this.drag.x;
    this.view.y = event.clientY - this.drag.y;
    this.apply();
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.canvas.classList.remove("dragging");
    this.onViewChange(this.getView());
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.k * (event.deltaY < 0 ? 1.1 : 0.9)));

    // zoom centré sur le curseur : le point sous la souris ne bouge pas
    this.view.x = mx - (mx - this.view.x) * (next / this.view.k);
    this.view.y = my - (my - this.view.y) * (next / this.view.k);
    this.view.k = next;
    this.apply();
    this.onViewChange(this.getView());
  }
}
