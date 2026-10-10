import type { AppContext, GameState, Screen, ScreenParams } from '../../core/types';
import { formatMoney } from '../../core/ladder';
import { h } from '../dom';
import '../../styles/stats.css';

export function money(n: number, state: GameState): string {
  const cur = state.config.ladder.currency;
  try {
    return formatMoney(n, cur);
  } catch {
    const s = Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return cur === 'pts' ? `${s} pts` : `${cur}${s}`;
  }
}

const OUTCOME_TEXT: Record<string, string> = {
  won: 'Top prize! You won the game',
  walked: 'You walked away with your winnings',
  wrong: 'Wrong answer - you drop to your safe haven',
  timeout: 'Time ran out',
};

export function lifelineName(state: GameState, id: string): string {
  return state.config.lifelines.find((l) => l.id === id)?.name ?? id;
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export const resultsScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, params?: ScreenParams): () => void {
    const state = params?.finalState;
    const el = h('main', { class: 'screen screen-results' }, h('h1', null, 'Results'));
    if (!state) {
      el.append(
        h('p', { class: 'st-empty' }, 'No finished game to show.'),
        h('button', { type: 'button', class: 'btn', onclick: () => ctx.navigate('menu') }, 'Menu'),
      );
      root.appendChild(el);
      return () => el.remove();
    }
    const outcome = state.outcome ?? 'wrong';
    const winnings = state.winnings ?? 0;
    const total = state.config.ladder.prizes.length;
    const lost = outcome === 'wrong' || outcome === 'timeout';
    const used = state.lifelinesUsed.map((id) => lifelineName(state, id));

    el.append(
      h(
        'section',
        { class: 'res-cheque' + (lost ? ' res-cheque--lost' : ''), 'aria-label': 'Winnings cheque' },
        h('div', { class: 'res-cheque__label' }, 'Pay to the contestant'),
        h('div', { class: 'res-cheque__amount', 'data-testid': 'winnings' }, money(winnings, state)),
        h('div', { class: 'res-cheque__outcome', 'data-outcome': outcome }, OUTCOME_TEXT[outcome]),
      ),
      h(
        'dl',
        { class: 'res-facts' },
        h('div', null, h('dt', null, 'Question reached'), h('dd', null, `${state.qIndex + 1} of ${total}`)),
        h(
          'div',
          null,
          h('dt', null, 'Lifelines used'),
          h('dd', { 'data-testid': 'lifelines' }, used.length ? used.join(', ') : 'None'),
        ),
      ),
      h(
        'div',
        { class: 'res-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            'data-action': 'again',
            onclick: () => ctx.navigate('game', { config: { ...state.config, seed: newSeed() } }),
          },
          'Play again',
        ),
        h(
          'button',
          { type: 'button', class: 'btn', 'data-action': 'menu', onclick: () => ctx.navigate('menu') },
          'Menu',
        ),
      ),
    );
    root.appendChild(el);
    ctx.announce(`${OUTCOME_TEXT[outcome]}. Winnings ${money(winnings, state)}.`);
    return () => el.remove();
  },
};
