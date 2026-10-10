// WP6: phone-a-friend conversation.
import type { Hint } from '../../core/types';
import { h } from '../dom';

/** Renders the phone-a-friend conversation for a hint. `who` defaults to "Friend" (use "Host" for host hints). */
export function phoneDialog(hint: Hint, answers: string[], who = 'Friend'): HTMLElement {
  const letters = ['A', 'B', 'C', 'D'];
  const conf =
    hint.answer === null
      ? 'no idea'
      : hint.confidence >= 0.8
        ? 'very sure'
        : hint.confidence >= 0.55
          ? 'fairly sure'
          : 'unsure';
  const pick =
    hint.answer !== null && answers[hint.answer] !== undefined
      ? `${who} leans towards ${letters[hint.answer]}: ${answers[hint.answer]} (${conf}).`
      : `${who} could not choose an answer.`;
  return h(
    'div',
    {
      class: 'phone-dialog',
      role: 'group',
      'aria-label': who === 'Friend' ? 'Phone a friend' : `${who} hint`,
    },
    who === 'Friend'
      ? h(
          'p',
          { class: 'phone-line phone-line--host' },
          h('strong', null, 'Host: '),
          '"Your friend is on the line."',
        )
      : null,
    h(
      'p',
      { class: 'phone-line phone-line--friend' },
      h('strong', null, `${who}: `),
      `"${hint.text}"`,
    ),
    h('p', { class: 'phone-summary' }, pick),
  );
}
