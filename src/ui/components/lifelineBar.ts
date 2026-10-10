// WP6: lifeline buttons with icons and remaining-use counts.
import type { LifelineDef } from '../../core/types';
import { h } from '../dom';

export interface LifelineBarProps {
  lifelines: LifelineDef[];
  uses: Record<string, number>;
  /** Ids currently usable. */
  available: string[];
  onUse: (id: string) => void;
}

export function lifelineBar(props: LifelineBarProps): HTMLElement {
  const bar = h('div', { class: 'lifeline-bar', role: 'group', 'aria-label': 'Lifelines' });
  for (const def of props.lifelines) {
    const used = props.uses[def.id] ?? 0;
    const left = Math.max(0, def.uses - used);
    const usable = props.available.includes(def.id);
    const spent = left === 0;
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'lifeline' + (spent ? ' lifeline--spent' : ''),
        dataset: { id: def.id },
        disabled: !usable,
        'aria-label': `${def.name}, ${spent ? 'used' : left + ' left'}${usable ? '' : ', unavailable'}`,
        title: def.name,
      },
      h('span', { class: 'lifeline-icon', 'aria-hidden': 'true' }, def.icon),
      def.icon === def.name ? null : h('span', { class: 'lifeline-name' }, def.name),
      def.uses > 1 && !spent
        ? h('span', { class: 'lifeline-count', 'aria-hidden': 'true' }, `×${left}`)
        : null,
      spent ? h('span', { class: 'lifeline-x', 'aria-hidden': 'true' }, '✕') : null,
    );
    btn.addEventListener('click', () => {
      if (!btn.disabled) props.onUse(def.id);
    });
    bar.appendChild(btn);
  }
  return bar;
}
