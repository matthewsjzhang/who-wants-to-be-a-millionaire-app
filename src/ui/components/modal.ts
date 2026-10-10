// WP6: accessible modal dialog with focus trap + focus return.
import { h, focusableIn } from '../dom';

export interface ModalOptions {
  title: string;
  body: Node | string;
  actions: { label: string; value: string; primary?: boolean }[];
}

interface Open {
  close: (v: string | null) => void;
  primary?: string;
}
const stack: Open[] = [];

/** True when any modal is open. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}
/** Close the top modal with Esc semantics (resolves null). */
export function closeTopModal(): void {
  stack[stack.length - 1]?.close(null);
}
/** Resolve the top modal with its primary action (Enter semantics). */
export function confirmTopModal(): void {
  const top = stack[stack.length - 1];
  if (top && top.primary !== undefined) top.close(top.primary);
}
export function closeAllModals(): void {
  while (stack.length) stack[stack.length - 1].close(null);
}

let uid = 0;

/** Opens a role="dialog" modal with focus trap + focus return; resolves with the chosen action value (or null on Esc). */
export function openModal(opts: ModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const titleId = `modal-title-${++uid}`;
    const buttons = opts.actions.map((a) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn' + (a.primary ? ' btn--primary' : ''),
          dataset: { value: a.value },
        },
        a.label,
      ),
    );
    const dialog = h(
      'div',
      {
        class: 'modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        tabindex: '-1',
      },
      h('h2', { class: 'modal-title', id: titleId }, opts.title),
      h('div', { class: 'modal-body' }, opts.body),
      h('div', { class: 'modal-actions' }, buttons),
    );
    const overlay = h('div', { class: 'modal-overlay' }, dialog);
    let done = false;
    const entry: Open = {
      primary: opts.actions.find((a) => a.primary)?.value,
      close(v) {
        if (done) return;
        done = true;
        overlay.removeEventListener('keydown', onKey);
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
        overlay.remove();
        try {
          prev?.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
        resolve(v);
      },
    };
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        entry.close(null);
      } else if (e.key === 'Tab') {
        const f = focusableIn(dialog);
        if (!f.length) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    buttons.forEach((b, i) =>
      b.addEventListener('click', () => entry.close(opts.actions[i].value)),
    );
    overlay.addEventListener('keydown', onKey);
    stack.push(entry);
    document.body.appendChild(overlay);
    const pi = opts.actions.findIndex((a) => a.primary);
    (buttons[pi >= 0 ? pi : 0] ?? dialog).focus();
  });
}
