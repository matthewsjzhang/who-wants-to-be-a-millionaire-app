// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installKeyboard } from '../../../src/ui/keyboard';

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

describe('installKeyboard', () => {
  it('maps letters and digits to select(i)', () => {
    const select = vi.fn();
    dispose = installKeyboard({ select });
    press('a');
    press('D');
    press('2');
    expect(select.mock.calls.map((c) => c[0])).toEqual([0, 3, 1]);
  });

  it('dispatches lifelines, walk, ladder, mute, custom, confirm, cancel', () => {
    const h = {
      fiftyFifty: vi.fn(), phone: vi.fn(), audience: vi.fn(), switch: vi.fn(), doubleDip: vi.fn(),
      walk: vi.fn(), ladder: vi.fn(), mute: vi.fn(), custom: vi.fn(), confirm: vi.fn(), cancel: vi.fn(),
    };
    dispose = installKeyboard(h);
    for (const k of ['f', 'p', 'u', 's', 'd', 'w', 'l', 'm', '5', '9', 'Enter', 'Escape']) press(k);
    expect(h.fiftyFifty).toHaveBeenCalledTimes(1);
    expect(h.phone).toHaveBeenCalledTimes(1);
    expect(h.audience).toHaveBeenCalledTimes(1);
    expect(h.switch).toHaveBeenCalledTimes(1);
    expect(h.doubleDip).toHaveBeenCalledTimes(1);
    expect(h.walk).toHaveBeenCalledTimes(1);
    expect(h.ladder).toHaveBeenCalledTimes(1);
    expect(h.mute).toHaveBeenCalledTimes(1);
    expect(h.custom.mock.calls.map((c) => c[0])).toEqual([5, 9]);
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it('ignores keys while typing in inputs and with modifiers', () => {
    const select = vi.fn();
    dispose = installKeyboard({ select });
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    press('a', input);
    press('a', document.body, { ctrlKey: true });
    expect(select).not.toHaveBeenCalled();
  });

  it('does not preventDefault for unhandled keys', () => {
    dispose = installKeyboard({});
    expect(press('a').defaultPrevented).toBe(false);
  });

  it('shows help overlay on ?, closes on Esc without firing cancel, restores focus', () => {
    const cancel = vi.fn();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    dispose = installKeyboard({ cancel });
    press('?');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    press('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
  });

  it('disposer removes listener and help', () => {
    const select = vi.fn();
    const off = installKeyboard({ select });
    press('?');
    off();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    press('a');
    expect(select).not.toHaveBeenCalled();
  });
});
