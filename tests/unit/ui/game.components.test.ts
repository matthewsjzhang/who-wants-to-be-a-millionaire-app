import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/core/ladder', () => ({
  formatMoney: (n: number, c: string) => `${c}${n}`,
  guaranteedAt: () => 0,
  LADDER_PRESETS: [],
}));

import { hexAnswer, updateHex } from '../../../src/ui/components/hexAnswer';
import { ladderPanel } from '../../../src/ui/components/ladderPanel';
import { lifelineBar } from '../../../src/ui/components/lifelineBar';
import { openModal, isModalOpen, closeAllModals } from '../../../src/ui/components/modal';
import { audienceChart } from '../../../src/ui/components/audienceChart';
import { phoneDialog } from '../../../src/ui/components/phoneDialog';
import { timerRing } from '../../../src/ui/components/timerRing';
import { hostBubble, hostLine } from '../../../src/ui/components/hostBubble';
import type { LadderConfig, LifelineDef } from '../../../src/core/types';

const ladder: LadderConfig = {
  id: 't',
  name: 't',
  currency: '$',
  prizes: [100, 200, 300, 400, 500],
  safeHavens: [1, 3],
};

describe('hexAnswer', () => {
  it('picks when idle and not when eliminated/disabled', () => {
    const onPick = vi.fn();
    const el = hexAnswer({ index: 2, text: 'Paris', state: 'idle', onPick });
    el.click();
    expect(onPick).toHaveBeenCalledWith(2);
    updateHex(el, { index: 2, text: 'Paris', state: 'eliminated', onPick });
    el.click();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('Paris');
    updateHex(el, { index: 2, text: 'Paris', state: 'idle', disabled: true, onPick });
    el.click();
    expect(onPick).toHaveBeenCalledTimes(1);
  });
  it('exposes state via text mark and aria-label (not colour alone)', () => {
    const el = hexAnswer({ index: 0, text: 'Rome', state: 'correct' });
    expect(el.dataset.state).toBe('correct');
    expect(el.querySelector('.hex-mark')?.textContent).toBe('\u2713');
    expect(el.getAttribute('aria-label')).toContain('correct');
  });
});

describe('ladderPanel', () => {
  it('marks current rung with aria-current and safe havens', () => {
    const p = ladderPanel({ ladder, qIndex: 2 });
    expect(p.querySelectorAll('[aria-current="step"]').length).toBe(1);
    expect(p.querySelector('[aria-current="step"]')?.getAttribute('data-q')).toBe('2');
    expect(p.querySelectorAll('.rung--safe').length).toBe(2);
    p.update(3);
    expect(p.querySelector('[aria-current="step"]')?.getAttribute('data-q')).toBe('3');
    expect(p.querySelector('li')?.getAttribute('data-q')).toBe('4'); // top first
  });
});

describe('lifelineBar', () => {
  const defs: LifelineDef[] = [
    {
      id: 'a',
      name: '50:50',
      icon: '5',
      effect: 'remove-wrong',
      params: { n: 2 },
      uses: 1,
      builtIn: true,
    },
    {
      id: 'b',
      name: 'Phone',
      icon: 'P',
      effect: 'friend-hint',
      params: {},
      uses: 1,
      builtIn: true,
    },
  ];
  it('disables unavailable lifelines and fires onUse', () => {
    const onUse = vi.fn();
    const bar = lifelineBar({ lifelines: defs, uses: { b: 1 }, available: ['a'], onUse });
    const [a, b] = Array.from(bar.querySelectorAll('button'));
    expect(b.disabled).toBe(true);
    expect(b.className).toContain('spent');
    a.click();
    expect(onUse).toHaveBeenCalledWith('a');
  });
});

describe('modal', () => {
  it('traps focus, resolves with value, returns focus', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const p = openModal({
      title: 'Final answer?',
      body: 'B: x',
      actions: [
        { label: 'Not yet', value: 'no' },
        { label: 'Final answer', value: 'yes', primary: true },
      ],
    });
    expect(isModalOpen()).toBe(true);
    const dlg = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const btns = dlg.querySelectorAll('button');
    expect(document.activeElement).toBe(btns[1]);
    btns[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(btns[0]);
    btns[1].click();
    expect(await p).toBe('yes');
    expect(isModalOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
  it('Esc resolves null', async () => {
    const p = openModal({
      title: 't',
      body: 'b',
      actions: [{ label: 'ok', value: 'ok', primary: true }],
    });
    document
      .querySelector('.modal-overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
    closeAllModals();
  });
});

describe('audienceChart / phoneDialog / timerRing / host', () => {
  it('renders four bars with labelled percentages', () => {
    const c = audienceChart([10, 20, 30, 40]);
    expect(c.querySelectorAll('.aud-col').length).toBe(4);
    expect(c.getAttribute('aria-label')).toContain('D 40 percent');
  });
  it('phone dialog names the suggested answer', () => {
    const d = phoneDialog({ answer: 1, confidence: 0.9, text: 'I think it is B' }, [
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(d.textContent).toContain('B: b');
    const none = phoneDialog({ answer: null, confidence: 0, text: 'No idea' }, [
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(none.textContent).toContain('could not choose');
  });
  it('timer ring updates label and urgency', () => {
    const r = timerRing();
    r.update(30000, 30000);
    expect(r.el.textContent).toBe('30');
    r.update(4100, 30000);
    expect(r.el.textContent).toBe('5');
    expect(r.el.classList.contains('timer-ring--urgent')).toBe(true);
  });
  it('host lines and bubble toggle', () => {
    expect(hostLine('final')).toBe('Is that your final answer?');
    expect(hostLine('walk', { amount: '$1' })).toContain('$1');
    const b = hostBubble();
    b.say('hi');
    expect(b.el.hidden).toBe(false);
    b.setEnabled(false);
    expect(b.el.hidden).toBe(true);
  });
});
