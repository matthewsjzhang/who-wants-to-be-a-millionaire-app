// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveRegion, prefersReducedMotion, trapFocus } from '../../../src/ui/a11y';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function tab(el: Element, shift = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

describe('trapFocus', () => {
  it('focuses first element, wraps Tab and Shift+Tab, restores focus on release', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const box = document.createElement('div');
    box.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    document.body.appendChild(box);
    const a = box.querySelector<HTMLElement>('#a')!;
    const b = box.querySelector<HTMLElement>('#b')!;
    const release = trapFocus(box);
    expect(document.activeElement).toBe(a);
    b.focus();
    expect(tab(b).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(a);
    expect(tab(a, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b);
    release();
    expect(document.activeElement).toBe(outside);
  });

  it('focuses the container when it has nothing focusable', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const release = trapFocus(box);
    expect(document.activeElement).toBe(box);
    release();
  });
});

describe('createLiveRegion', () => {
  it('announces politely and assertively, and cleans up', () => {
    vi.useFakeTimers();
    const live = createLiveRegion();
    live.announce('hello');
    live.announce('alert!', true);
    vi.advanceTimersByTime(50);
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toContain('hello');
    expect(document.querySelector('[aria-live="assertive"]')!.textContent).toContain('alert!');
    live.destroy();
    expect(document.querySelector('[aria-live]')).toBeNull();
  });
});

describe('prefersReducedMotion', () => {
  it('honours explicit overrides', () => {
    expect(prefersReducedMotion('on')).toBe(true);
    expect(prefersReducedMotion('off')).toBe(false);
  });
});
