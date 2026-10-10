import { describe, it, expect, vi } from 'vitest';
import { settingsScreen } from '../../../src/ui/screens/settings';
import type { AppContext, Settings } from '../../../src/core/types';

const DEFAULTS: Settings = {
  muted: false,
  volume: 0.6,
  reducedMotion: 'system',
  shuffleAnswers: true,
  defaultTimer: { mode: 'off' },
  hostCommentary: true,
  revealDelayMs: 2500,
};

function make() {
  let s = { ...DEFAULTS };
  const update = vi.fn((p: Partial<Settings>) => (s = { ...s, ...p }));
  const ctx = {
    navigate: vi.fn(),
    getSettings: () => s,
    updateSettings: update,
  } as unknown as AppContext;
  const root = document.createElement('div');
  settingsScreen.mount(root, ctx);
  return { root, update };
}
const q = (r: HTMLElement, id: string) => r.querySelector('#' + id) as HTMLInputElement;

describe('settings screen', () => {
  it('toggles update settings', () => {
    const { root, update } = make();
    const m = q(root, 'set-muted');
    m.checked = true;
    m.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenCalledWith({ muted: true });
    const v = q(root, 'set-volume');
    v.value = '30';
    v.dispatchEvent(new Event('input'));
    expect(update).toHaveBeenCalledWith({ volume: 0.3 });
    const mo = root.querySelector('#set-motion') as HTMLSelectElement;
    mo.value = 'on';
    mo.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenCalledWith({ reducedMotion: 'on' });
  });
  it('timer and delay', () => {
    const { root, update } = make();
    const t = q(root, 'set-timer');
    t.checked = true;
    t.dispatchEvent(new Event('change'));
    const arg = update.mock.calls.at(-1)![0].defaultTimer;
    expect(arg?.mode).toBe('clock');
    const d = q(root, 'set-delay');
    d.value = '1000';
    d.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenCalledWith({ revealDelayMs: 1000 });
  });
  it('lists shortcuts', () => {
    const { root } = make();
    expect(root.querySelectorAll('.set-keys dt').length).toBeGreaterThan(8);
  });
});
