import type { AppContext, ReducedMotion, Screen, ScreenParams, TimerConfig } from '../../core/types';
import { h } from '../dom';
import '../../styles/stats.css';

export const SHORTCUTS: [string, string][] = [
  ['A-D / 1-4', 'Select an answer'],
  ['Enter', 'Final answer / confirm'],
  ['Esc', 'Cancel'],
  ['F', 'Fifty-fifty'],
  ['P', 'Phone a friend'],
  ['U', 'Ask the audience'],
  ['S', 'Switch the question'],
  ['D', 'Double dip'],
  ['5-9', 'Custom lifelines'],
  ['W', 'Walk away'],
  ['L', 'Toggle ladder'],
  ['M', 'Mute / unmute'],
  ['?', 'Show help'],
];

const DEFAULT_SECONDS = 30;

function timerSeconds(t: TimerConfig): number {
  return t.mode === 'clock' ? (t.secondsPerQuestion[0] ?? DEFAULT_SECONDS) : DEFAULT_SECONDS;
}

type BoolKey = 'muted' | 'shuffleAnswers' | 'hostCommentary';

export const settingsScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, _params?: ScreenParams): () => void {
    const s = ctx.getSettings();
    const el = h('main', { class: 'screen screen-settings' }, h('h1', null, 'Settings'));

    const check = (id: string, label: string, value: boolean, key: BoolKey): HTMLElement =>
      h(
        'div',
        { class: 'set-row' },
        h('input', {
          type: 'checkbox',
          id,
          checked: value,
          onchange: (e: Event) =>
            ctx.updateSettings({ [key]: (e.target as HTMLInputElement).checked }),
        }),
        h('label', { for: id }, label),
      );

    const volume = h('input', {
      type: 'range',
      id: 'set-volume',
      min: 0,
      max: 100,
      step: 1,
      oninput: (e: Event) =>
        ctx.updateSettings({ volume: Number((e.target as HTMLInputElement).value) / 100 }),
    });
    volume.value = String(Math.round(s.volume * 100));

    const motion = h(
      'select',
      {
        id: 'set-motion',
        onchange: (e: Event) =>
          ctx.updateSettings({
            reducedMotion: (e.target as HTMLSelectElement).value as ReducedMotion,
          }),
      },
      (['system', 'on', 'off'] as ReducedMotion[]).map((v) =>
        h(
          'option',
          { value: v, selected: s.reducedMotion === v },
          v === 'system' ? 'Follow system' : v === 'on' ? 'Reduce motion' : 'Full motion',
        ),
      ),
    );

    const secs = h('input', { type: 'number', id: 'set-seconds', min: 5, max: 300 });
    secs.value = String(timerSeconds(s.defaultTimer));
    secs.disabled = s.defaultTimer.mode !== 'clock';

    const applyTimer = (on: boolean): void => {
      const n = Math.min(300, Math.max(5, Math.round(Number(secs.value)) || DEFAULT_SECONDS));
      const prev = ctx.getSettings().defaultTimer;
      if (!on) {
        ctx.updateSettings({ defaultTimer: { mode: 'off' } });
        return;
      }
      const len = Math.max(15, prev.mode === 'clock' ? prev.secondsPerQuestion.length : 15);
      ctx.updateSettings({
        defaultTimer: {
          mode: 'clock',
          secondsPerQuestion: Array.from({ length: len }, () => n),
          bankUnusedToLast: prev.mode === 'clock' ? prev.bankUnusedToLast : false,
          onTimeout: prev.mode === 'clock' ? prev.onTimeout : 'lose',
        },
      });
    };
    const timerOn = h('input', {
      type: 'checkbox',
      id: 'set-timer',
      checked: s.defaultTimer.mode === 'clock',
      onchange: (e: Event) => {
        const on = (e.target as HTMLInputElement).checked;
        secs.disabled = !on;
        applyTimer(on);
      },
    });
    secs.addEventListener('change', () => applyTimer(ctx.getSettings().defaultTimer.mode === 'clock'));

    const delay = h('input', {
      type: 'number',
      id: 'set-delay',
      min: 0,
      max: 10000,
      step: 250,
      onchange: (e: Event) => {
        const n = Math.min(
          10000,
          Math.max(0, Math.round(Number((e.target as HTMLInputElement).value)) || 0),
        );
        ctx.updateSettings({ revealDelayMs: n });
      },
    });
    delay.value = String(s.revealDelayMs);

    el.append(
      h(
        'section',
        { class: 'set-section' },
        h('h2', null, 'Sound'),
        check('set-muted', 'Mute all sound', s.muted, 'muted'),
        h('div', { class: 'set-row' }, h('label', { for: 'set-volume' }, 'Volume'), volume),
      ),
      h(
        'section',
        { class: 'set-section' },
        h('h2', null, 'Display'),
        h('div', { class: 'set-row' }, h('label', { for: 'set-motion' }, 'Reduced motion'), motion),
        check('set-host', 'Host commentary', s.hostCommentary, 'hostCommentary'),
      ),
      h(
        'section',
        { class: 'set-section' },
        h('h2', null, 'Gameplay defaults'),
        check('set-shuffle', 'Shuffle answers', s.shuffleAnswers, 'shuffleAnswers'),
        h(
          'div',
          { class: 'set-row' },
          timerOn,
          h('label', { for: 'set-timer' }, 'Timer on by default'),
          h('label', { for: 'set-seconds' }, 'Seconds per question'),
          secs,
        ),
        h('div', { class: 'set-row' }, h('label', { for: 'set-delay' }, 'Reveal delay (ms)'), delay),
      ),
      h(
        'section',
        { class: 'set-section' },
        h('h2', null, 'Keyboard shortcuts'),
        h(
          'dl',
          { class: 'set-keys' },
          SHORTCUTS.map(([k, d]) => [h('dt', null, h('kbd', null, k)), h('dd', null, d)]),
        ),
      ),
      h(
        'button',
        { type: 'button', class: 'btn', 'data-action': 'menu', onclick: () => ctx.navigate('menu') },
        'Menu',
      ),
    );
    root.appendChild(el);
    return () => el.remove();
  },
};
