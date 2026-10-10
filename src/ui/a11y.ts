// WP10 owns this file.
import { focusableIn } from './dom';

/**
 * Traps Tab/Shift+Tab focus within `container`, moves focus into it, and restores
 * focus to the previously focused element when released.
 */
export function trapFocus(container: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const items = focusableIn(container);
    if (items.length === 0) {
      e.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === container || !container.contains(active))) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && (active === last || !container.contains(active))) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  container.addEventListener('keydown', onKey);
  const items = focusableIn(container);
  if (!container.contains(document.activeElement)) {
    if (items[0]) items[0].focus({ preventScroll: true });
    else {
      if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
      container.focus({ preventScroll: true });
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    container.removeEventListener('keydown', onKey);
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  };
}

export interface LiveRegion {
  announce(msg: string, assertive?: boolean): void;
  destroy(): void;
}

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

/** Visually hidden polite + assertive aria-live regions appended to body. */
export function createLiveRegion(): LiveRegion {
  const make = (level: 'polite' | 'assertive'): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', level);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', level === 'assertive' ? 'alert' : 'status');
    el.className = 'sr-only live-region';
    el.style.cssText = VISUALLY_HIDDEN;
    document.body.appendChild(el);
    return el;
  };
  const polite = make('polite');
  const assertive = make('assertive');
  let toggle = false;
  return {
    announce(msg, isAssertive = false) {
      const el = isAssertive ? assertive : polite;
      el.textContent = '';
      // Alternate a trailing NBSP so repeated identical messages are re-announced.
      toggle = !toggle;
      setTimeout(() => {
        el.textContent = toggle ? msg : msg + ' ';
      }, 30);
    },
    destroy() {
      polite.remove();
      assertive.remove();
    },
  };
}

/** Reduced motion given the settings override ('system' | 'on' | 'off'). */
export function prefersReducedMotion(override: 'system' | 'on' | 'off' = 'system'): boolean {
  if (override === 'on') return true;
  if (override === 'off') return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
