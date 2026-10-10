// WP6: host speech bubble with scripted lines.
import { h } from '../dom';

export type HostLineKey = 'final' | 'milestone' | 'walk' | 'lose' | 'win' | 'intro' | 'correct';
export interface HostBubble {
  el: HTMLElement;
  say(text: string): void;
  setEnabled(enabled: boolean): void;
}

const LINES: Record<HostLineKey, string[]> = {
  intro: ["Welcome to the hot seat. Let's play for {prize}!"],
  final: [
    'Is that your final answer?',
    'Are you sure about that? Final answer?',
    'Interesting choice. Final answer?',
  ],
  correct: ["That's the right answer!", 'Correct! Well played.', 'You got it!'],
  milestone: [
    "You've reached a safe haven! {amount} is yours whatever happens.",
    'Safe! {amount} is guaranteed.',
  ],
  walk: [
    'Walking away with {amount}. A wise decision, congratulations!',
    'You take {amount} home. Well played!',
  ],
  lose: [
    "I'm sorry, that's not the answer. You leave with {amount}.",
    "Oh no, that's wrong. You go home with {amount}.",
  ],
  win: ['You have won {amount}! Congratulations!', 'Incredible! {amount} is yours!'],
};

/** Deterministic: vars.n selects among variants (defaults to the first). */
export function hostLine(key: HostLineKey, vars: Record<string, string> = {}): string {
  const arr = LINES[key];
  const n = Number(vars.n);
  const base = arr[Number.isFinite(n) ? Math.abs(Math.trunc(n)) % arr.length : 0];
  return base.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

export function hostBubble(): HostBubble {
  const text = h('p', { class: 'host-text' });
  const el = h(
    'div',
    { class: 'host-bubble', 'aria-hidden': 'true', hidden: true },
    h('span', { class: 'host-avatar' }, '🎤'),
    text,
  );
  let enabled = true;
  return {
    el,
    say(t) {
      text.textContent = t;
      el.hidden = !enabled || !t;
    },
    setEnabled(e) {
      enabled = e;
      if (!e) el.hidden = true;
      else if (text.textContent) el.hidden = false;
    },
  };
}
