import type { AppContext, Screen, ScreenId, ScreenParams } from '../core/types';
import { clear } from '../ui/dom';

export type { Screen, ScreenId, ScreenParams } from '../core/types';

export const SCREEN_IDS: ScreenId[] = [
  'menu',
  'setup',
  'game',
  'results',
  'editor',
  'stats',
  'settings',
];

export interface Router {
  /** Register a screen implementation. */
  register(id: ScreenId, screen: Screen): void;
  /** Navigate: updates location.hash and mounts the screen. Params are held in memory. */
  navigate(id: ScreenId, params?: ScreenParams): void;
  /** Mount whatever the current hash says (call once at startup). */
  start(): void;
  current(): ScreenId | null;
  destroy(): void;
}

export function parseHash(hash: string): ScreenId {
  const id = hash.replace(/^#\/?/, '').split(/[?/]/)[0] as ScreenId;
  return SCREEN_IDS.includes(id) ? id : 'menu';
}

export function createRouter(root: HTMLElement, getCtx: () => AppContext): Router {
  const screens = new Map<ScreenId, Screen>();
  let unmount: (() => void) | null = null;
  let currentId: ScreenId | null = null;
  let pendingParams: ScreenParams | undefined;

  function mountScreen(id: ScreenId, params?: ScreenParams): void {
    if (unmount) {
      try {
        unmount();
      } catch (e) {
        console.error('screen unmount failed', e);
      }
      unmount = null;
    }
    clear(root);
    const screen = screens.get(id);
    currentId = id;
    if (!screen) return;
    unmount = screen.mount(root, getCtx(), params);
    window.scrollTo?.(0, 0);
  }

  function onHashChange(): void {
    const id = parseHash(location.hash);
    const params = pendingParams;
    pendingParams = undefined;
    mountScreen(id, params);
  }

  return {
    register(id, screen) {
      screens.set(id, screen);
    },
    navigate(id, params) {
      pendingParams = params;
      const target = `#/${id}`;
      if (location.hash === target) {
        // Same hash: hashchange will not fire, so mount directly.
        onHashChange();
      } else {
        location.hash = target;
      }
    },
    start() {
      window.addEventListener('hashchange', onHashChange);
      onHashChange();
    },
    current: () => currentId,
    destroy() {
      window.removeEventListener('hashchange', onHashChange);
      unmount?.();
      unmount = null;
    },
  };
}
