/**
 * WinBox.js ne fournit pas de types. On ne déclare que ce qu'on utilise —
 * une fenêtre déplaçable, positionnée au curseur, refermable par son ✕.
 */
declare module "winbox/src/js/winbox.js" {
  interface WinBoxParams {
    title?: string;
    class?: string | string[];
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    minwidth?: number | string;
    minheight?: number | string;
    background?: string;
    border?: number;
    mount?: HTMLElement;
    onclose?: (force?: boolean) => boolean | void;
  }

  export default class WinBox {
    constructor(params: WinBoxParams);
    readonly body: HTMLElement;
    readonly dom: HTMLElement;
    focus(): this;
    hasClass(name: string): boolean;
    toggleClass(name: string): this;
    close(force?: boolean): boolean | void;
    move(x: number | string, y: number | string): this;
  }
}

declare module "winbox/dist/css/winbox.min.css";
