// WP6: hexagonal answer box. State is conveyed by text mark + border style, never colour alone.
import type { AnswerIndex } from '../../core/types';
import { h } from '../dom';

export type HexState = 'idle' | 'selected' | 'correct' | 'wrong' | 'eliminated';
export interface HexAnswerProps {
  index: AnswerIndex;
  text: string;
  state: HexState;
  disabled?: boolean;
  /** Answers not yet revealed (question presenting). */
  pending?: boolean;
  onPick?: (i: AnswerIndex) => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];
const MARKS: Record<HexState, string> = {
  idle: '',
  selected: '◆',
  correct: '✓',
  wrong: '✗',
  eliminated: '—',
};
const STATE_WORD: Record<HexState, string> = {
  idle: '',
  selected: ', selected',
  correct: ', correct',
  wrong: ', wrong',
  eliminated: ', removed',
};

const propsOf = new WeakMap<HTMLElement, HexAnswerProps>();

export function hexAnswer(props: HexAnswerProps): HTMLElement {
  const el = h(
    'button',
    { type: 'button', class: 'hex hex-answer', dataset: { index: String(props.index) } },
    h(
      'span',
      { class: 'hex-inner' },
      h('span', { class: 'hex-letter', 'aria-hidden': 'true' }, LETTERS[props.index]),
      h('span', { class: 'hex-text' }),
      h('span', { class: 'hex-mark', 'aria-hidden': 'true' }),
    ),
  );
  el.addEventListener('click', () => {
    const p = propsOf.get(el);
    if (!p || p.disabled || p.state === 'eliminated' || p.pending) return;
    p.onPick?.(p.index);
  });
  updateHex(el, props);
  return el;
}

/** Re-apply props to an existing hexAnswer element (keeps focus and DOM identity). */
export function updateHex(el: HTMLElement, props: HexAnswerProps): void {
  propsOf.set(el, props);
  const eliminated = props.state === 'eliminated';
  el.dataset.state = props.state;
  el.classList.toggle('hex--pending', !!props.pending);
  const text = el.querySelector('.hex-text');
  if (text) text.textContent = eliminated ? '' : props.text;
  const mark = el.querySelector('.hex-mark');
  if (mark) mark.textContent = MARKS[props.state];
  const inert = !!props.disabled || eliminated || !!props.pending;
  el.setAttribute('aria-disabled', inert ? 'true' : 'false');
  if (eliminated) el.setAttribute('disabled', '');
  else el.removeAttribute('disabled');
  el.setAttribute(
    'aria-label',
    eliminated
      ? `Answer ${LETTERS[props.index]}: removed`
      : `Answer ${LETTERS[props.index]}: ${props.text}${STATE_WORD[props.state]}`,
  );
  el.setAttribute('aria-pressed', props.state === 'selected' ? 'true' : 'false');
}
