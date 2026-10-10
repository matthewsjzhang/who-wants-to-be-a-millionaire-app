import type { AppContext, ScreenId, ScreenParams, Settings } from '../core/types';
import { getSettings, saveSettings } from '../storage/settings';
import { sound } from '../audio/sound';
import { createLiveRegion } from '../ui/a11y';

export interface ContextDeps {
  navigate: (screen: ScreenId, params?: ScreenParams) => void;
}

function parseDevParams(): AppContext['devParams'] {
  const out: AppContext['devParams'] = {};
  // Query may sit before or inside the hash; check both.
  const raw =
    location.search || (location.hash.includes('?') ? '?' + location.hash.split('?')[1] : '');
  const q = new URLSearchParams(raw);
  const seed = q.get('seed');
  if (seed !== null && seed !== '' && Number.isFinite(Number(seed))) out.seed = Number(seed);
  const bank = q.get('bank');
  if (bank) out.bank = bank;
  return out;
}

export function createContext(deps: ContextDeps): AppContext {
  let settings: Settings = getSettings();
  const live = createLiveRegion();
  const mq =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

  function applyMotionAttr(): void {
    const el = document.documentElement;
    if (settings.reducedMotion === 'system') el.removeAttribute('data-motion');
    else el.setAttribute('data-motion', settings.reducedMotion);
  }
  applyMotionAttr();
  sound.setMuted(settings.muted);
  sound.setVolume(settings.volume);

  return {
    navigate: deps.navigate,
    getSettings: () => settings,
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      saveSettings(settings);
      sound.setMuted(settings.muted);
      sound.setVolume(settings.volume);
      applyMotionAttr();
      return settings;
    },
    sound,
    announce: (message, assertive) => live.announce(message, assertive),
    reducedMotion() {
      if (settings.reducedMotion === 'on') return true;
      if (settings.reducedMotion === 'off') return false;
      return !!mq?.matches;
    },
    devParams: parseDevParams(),
  };
}
