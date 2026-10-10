// WP6: audience poll bars (index 0-3 = A-D).
import { h } from '../dom';

/** Renders audience poll percentages (index 0-3 = A-D) as CSS bars. */
export function audienceChart(poll: number[]): HTMLElement {
  const letters = ['A', 'B', 'C', 'D'];
  const desc = poll.map((p, i) => `${letters[i]} ${Math.round(p)} percent`).join(', ');
  const cols = poll.map((p, i) => {
    const pct = Math.max(0, Math.min(100, Math.round(p)));
    return h(
      'div',
      { class: 'aud-col' },
      h('span', { class: 'aud-pct' }, `${pct}%`),
      h('div', { class: 'aud-track' }, h('div', { class: 'aud-bar', style: `--h:${pct}%` })),
      h('span', { class: 'aud-letter' }, letters[i]),
    );
  });
  return h(
    'div',
    { class: 'audience-chart', role: 'img', 'aria-label': `Audience poll: ${desc}` },
    cols,
  );
}
