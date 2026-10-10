import type { AppContext, HistoryEntry, Screen, ScreenParams } from '../../core/types';
import { clearHistory, getHistory, getStats } from '../../storage/history';
import { h } from '../dom';
import '../../styles/stats.css';

function fmt(n: number, cur?: string): string {
  const s = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return !cur ? s : cur === 'pts' ? `${s} pts` : `${cur}${s}`;
}

function bars(rows: { label: string; value: number; text?: string }[], label: string): HTMLElement {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h(
    'ul',
    { class: 'st-bars', 'aria-label': label },
    rows.map((r) =>
      h(
        'li',
        { class: 'st-bar' },
        h('span', null, r.label),
        h(
          'span',
          { class: 'st-bar__track', 'aria-hidden': 'true' },
          h('span', { class: 'st-bar__fill', style: `width:${Math.round((r.value / max) * 100)}%` }),
        ),
        h('span', null, r.text ?? String(r.value)),
      ),
    ),
  );
}

function tile(label: string, value: string): HTMLElement {
  return h(
    'div',
    { class: 'st-tile' },
    h('div', { class: 'st-tile__label' }, label),
    h('div', { class: 'st-tile__value' }, value),
  );
}

export function perBank(history: HistoryEntry[]): { id: string; games: number; wins: number }[] {
  const m = new Map<string, { id: string; games: number; wins: number }>();
  for (const e of history) {
    const id = e.bankId ?? e.customGameId ?? 'unknown';
    const r = m.get(id) ?? { id, games: 0, wins: 0 };
    r.games++;
    if (e.outcome === 'won') r.wins++;
    m.set(id, r);
  }
  return [...m.values()].sort((a, b) => b.games - a.games);
}

export const statsScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, _params?: ScreenParams): () => void {
    const el = h('main', { class: 'screen screen-stats' });
    root.appendChild(el);

    function render(): void {
      el.replaceChildren();
      const history = getHistory();
      const stats = getStats();
      el.append(h('h1', null, 'Stats'));
      if (stats.games === 0 && history.length === 0) {
        el.append(h('p', { class: 'st-empty', 'data-testid': 'empty' }, 'No games played yet.'));
      } else {
        const winRate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;
        const avg = stats.games ? stats.totalWinnings / stats.games : 0;
        const ll = Object.entries(stats.lifelineUsage).sort((a, b) => b[1] - a[1]);
        el.append(
          h(
            'div',
            { class: 'st-grid' },
            tile('Games', String(stats.games)),
            tile('Win rate', `${winRate}%`),
            tile('Avg winnings', fmt(avg)),
            tile('Best winnings', fmt(stats.bestWinnings)),
          ),
          h(
            'section',
            { class: 'st-section' },
            h('h2', null, 'Lifeline usage'),
            ll.length
              ? bars(
                  ll.map(([k, v]) => ({ label: k, value: v })),
                  'Lifeline usage',
                )
              : h('p', { class: 'st-empty' }, 'None used yet.'),
          ),
          h(
            'section',
            { class: 'st-section' },
            h('h2', null, 'Per question set'),
            bars(
              perBank(history).map((b) => ({
                label: b.id,
                value: b.games,
                text: `${b.games} played, ${b.wins} won`,
              })),
              'Games per set',
            ),
          ),
          h(
            'section',
            { class: 'st-section' },
            h('h2', null, 'History'),
            h(
              'div',
              { class: 'st-table-wrap' },
              h(
                'table',
                { class: 'st-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    ['Date', 'Set', 'Reached', 'Outcome', 'Winnings'].map((c) =>
                      h('th', { scope: 'col' }, c),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  [...history].reverse().map((e) =>
                    h(
                      'tr',
                      { 'data-row': 'history' },
                      h('td', null, new Date(e.date).toLocaleDateString()),
                      h('td', null, e.bankId ?? e.customGameId ?? '-'),
                      h('td', null, `Q${e.reachedQ + 1}`),
                      h('td', null, e.outcome),
                      h('td', null, fmt(e.winnings, e.currency)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      el.append(
        h(
          'div',
          { class: 'st-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              'data-action': 'clear',
              disabled: history.length === 0 && stats.games === 0,
              onclick: () => {
                if (typeof window.confirm === 'function' && !window.confirm('Clear all history?')) return;
                clearHistory();
                ctx.announce('History cleared');
                render();
              },
            },
            'Clear history',
          ),
          h(
            'button',
            { type: 'button', class: 'btn', 'data-action': 'menu', onclick: () => ctx.navigate('menu') },
            'Menu',
          ),
        ),
      );
    }
    render();
    return () => el.remove();
  },
};
