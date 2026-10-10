// WP6: right-side prize ladder. <ol> with aria-current="step" on the current rung.
import type { LadderConfig } from '../../core/types';
import { formatMoney } from '../../core/ladder';
import { h } from '../dom';

export interface LadderPanelProps {
  ladder: LadderConfig;
  /** 0-based current question; rendered with aria-current="step". */
  qIndex: number;
}
export type LadderPanelEl = HTMLElement & { update: (qIndex: number) => void };

export function ladderPanel(props: LadderPanelProps): LadderPanelEl {
  const { ladder } = props;
  const items: HTMLLIElement[] = [];
  const list = h('ol', { class: 'ladder-list', 'aria-label': 'Prize ladder' });
  for (let i = ladder.prizes.length - 1; i >= 0; i--) {
    const safe = ladder.safeHavens.includes(i);
    const label =
      i === ladder.prizes.length - 1 && ladder.topPrizeLabel
        ? ladder.topPrizeLabel
        : formatMoney(ladder.prizes[i], ladder.currency);
    const li = h(
      'li',
      { class: 'rung' + (safe ? ' rung--safe' : ''), dataset: { q: String(i) }, value: i + 1 },
      h('span', { class: 'rung-num' }, String(i + 1)),
      h('span', { class: 'rung-mark', 'aria-hidden': 'true' }, safe ? '★' : '◇'),
      h('span', { class: 'rung-prize' }, label),
      safe ? h('span', { class: 'sr-only' }, ' (safe haven)') : null,
    );
    items[i] = li;
    list.appendChild(li);
  }
  const el = h('div', { class: 'ladder-panel' }, list) as unknown as LadderPanelEl;
  el.update = (q: number) => {
    items.forEach((li, i) => {
      li.classList.toggle('rung--current', i === q);
      li.classList.toggle('rung--passed', i < q);
      if (i === q) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  };
  el.update(props.qIndex);
  return el;
}
