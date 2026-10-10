export type Child = Node | string | number | null | undefined | false | Child[];
export type Attrs = Record<string, unknown>;

function append(el: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((c) => append(el, c));
  } else if (child instanceof Node) {
    el.appendChild(child);
  } else {
    el.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Tiny hyperscript helper. Attr conventions: `class`/`className`, `style` (string or object),
 * `onclick`-style handlers (function values on `on*` keys), `dataset` (object), boolean attrs,
 * `aria-*`/`data-*`/others via setAttribute. null/undefined/false attrs are skipped.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  children.forEach((c) => append(el, c));
  return el;
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`qs: no element matches "${sel}"`);
  return el;
}

export function qsa<T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function focusableIn(root: ParentNode): HTMLElement[] {
  return qsa<HTMLElement>(FOCUSABLE, root).filter((e) => !e.hasAttribute('hidden'));
}

/** Focus an element without scrolling. Safe on null. */
export function focusEl(el: HTMLElement | null | undefined): void {
  el?.focus({ preventScroll: true });
}

/** Remember the active element; returns a function that restores focus to it. */
export function saveFocus(): () => void {
  const prev = document.activeElement as HTMLElement | null;
  return () => focusEl(prev);
}
