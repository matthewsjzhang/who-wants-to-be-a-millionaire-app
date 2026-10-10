// WP10 owns this file.
import { trapFocus } from './a11y';

/**
 * Handler map. All optional; unhandled keys are ignored (and not preventDefault-ed).
 *  - select(i)   : i = 0..3 (A-D or 1-4)
 *  - confirm     : Enter ("final answer" / confirm)
 *  - cancel      : Esc (only when the help overlay is not open)
 *  - fiftyFifty / phone / audience / switch / doubleDip : F / P / U / S / D
 *    (D selects answer D unless a doubleDip handler is registered; 4 always selects D)
 *  - walk        : W
 *  - ladder      : L
 *  - mute        : M
 *  - custom(n)   : n = 5..9 (custom lifelines by position)
 *  - help        : optional override for `?`; default shows the built-in help overlay
 */
export interface KeyboardHandlers {
  [action: string]: ((arg?: number) => void) | undefined;
}

export const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['A B C D / 1 2 3 4', 'Select an answer'],
  ['Enter', 'Final answer / confirm'],
  ['Esc', 'Cancel / close'],
  ['F', '50:50'],
  ['P', 'Phone a friend'],
  ['U', 'Ask the audience'],
  ['S', 'Switch the question'],
  ['D', 'Double dip (when enabled; otherwise answer D)'],
  ['5 - 9', 'Custom lifelines'],
  ['W', 'Walk away'],
  ['L', 'Toggle prize ladder'],
  ['M', 'Mute / unmute'],
  ['?', 'Show this help'],
];

const LIFELINE_KEYS: Record<string, string> = {
  f: 'fiftyFifty',
  p: 'phone',
  u: 'audience',
  s: 'switch',
  d: 'doubleDip',
};

/** True if the event target is somewhere the user is typing text. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(type);
  }
  return false;
}

function buildHelp(): { el: HTMLElement; close: () => void } {
  const prevFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'kbd-help-overlay';
  overlay.setAttribute('data-kbd-help', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);';
  const dlg = document.createElement('div');
  dlg.className = 'kbd-help';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'kbd-help-title');
  dlg.tabIndex = -1;
  dlg.style.cssText =
    'background:#14144f;color:#fff;border:2px solid #f5b301;border-radius:12px;padding:1.25rem 1.5rem;max-width:min(32rem,92vw);max-height:90vh;overflow:auto;';
  const title = document.createElement('h2');
  title.id = 'kbd-help-title';
  title.textContent = 'Keyboard shortcuts';
  title.style.marginTop = '0';
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%;';
  for (const [k, d] of SHORTCUTS) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.style.cssText = 'text-align:left;padding:.25rem .75rem .25rem 0;white-space:nowrap;';
    const kbd = document.createElement('kbd');
    kbd.textContent = k;
    th.appendChild(kbd);
    const td = document.createElement('td');
    td.textContent = d;
    tr.append(th, td);
    table.appendChild(tr);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Close';
  btn.style.marginTop = '1rem';
  dlg.append(title, table, btn);
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  const release = trapFocus(dlg);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    release();
    overlay.remove();
    prevFocus?.focus?.({ preventScroll: true });
  };
  btn.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  return { el: overlay, close };
}

/**
 * Installs global shortcuts; returns a disposer.
 * Keys: A-D/1-4 select, Enter, Esc, F/P/U/S/D lifelines, W walk, L ladder, M mute, ? help, 5-9 custom lifelines.
 */
export function installKeyboard(handlers: KeyboardHandlers): () => void {
  let help: { el: HTMLElement; close: () => void } | null = null;

  const closeHelp = (): void => {
    help?.close();
    help = null;
  };
  const toggleHelp = (): void => {
    if (help && help.el.isConnected) closeHelp();
    else help = buildHelp();
  };

  const call = (name: string, arg?: number): boolean => {
    const fn = handlers[name];
    if (!fn) return false;
    fn(arg);
    return true;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;

    const key = e.key;

    if (help && !help.el.isConnected) help = null;
    if (help) {
      // While help is open only Esc / ? act; Tab is handled by the focus trap.
      if (key === 'Escape' || key === '?') {
        e.preventDefault();
        closeHelp();
      }
      return;
    }

    if (key === '?') {
      e.preventDefault();
      if (!call('help')) toggleHelp();
      return;
    }
    if (key === 'Escape') {
      if (call('cancel')) e.preventDefault();
      return;
    }
    if (key === 'Enter') {
      // Let focused buttons/links activate natively to avoid double-firing.
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('button,a[href],summary,[role="button"]')) return;
      if (call('confirm')) e.preventDefault();
      return;
    }
    if (key.length !== 1) return;
    const k = key.toLowerCase();

    if (k === 'd' && handlers.doubleDip) {
      // "D" is both answer D and Double Dip: Double Dip wins whenever a handler is registered
      // (register it only while the lifeline is in play); the digit 4 always selects answer D.
      handlers.doubleDip();
      e.preventDefault();
    } else if (k >= 'a' && k <= 'd') {
      if (call('select', k.charCodeAt(0) - 97)) e.preventDefault();
    } else if (k >= '1' && k <= '4') {
      if (call('select', Number(k) - 1)) e.preventDefault();
    } else if (k >= '5' && k <= '9') {
      if (call('custom', Number(k))) e.preventDefault();
    } else if (k in LIFELINE_KEYS) {
      if (call(LIFELINE_KEYS[k])) e.preventDefault();
    } else if (k === 'w') {
      if (call('walk')) e.preventDefault();
    } else if (k === 'l') {
      if (call('ladder')) e.preventDefault();
    } else if (k === 'm') {
      if (call('mute')) e.preventDefault();
    }
  };

  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    closeHelp();
  };
}
