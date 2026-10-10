// WP7: game setup - lifelines, ladder, timer, shuffle, then build a GameConfig and start.
import '../../styles/menu.css';
import type {
  AppContext,
  CustomGame,
  GameConfig,
  LadderConfig,
  LifelineDef,
  Question,
  QuestionBank,
  Screen,
  ScreenParams,
  TimerConfig,
} from '../../core/types';
import { h, clear } from '../dom';
import { LADDER_PRESETS } from '../../core/ladder';
import { BUILT_IN_LIFELINES, DEFAULT_LIFELINE_IDS } from '../../core/lifelines';
import { loadBank, randomBank } from '../../data/bankLoader';
import { listCustomGames, listCustomLifelines } from '../../storage/customGames';

export const DEFAULT_ON_LIFELINES = DEFAULT_LIFELINE_IDS;
export const OWN_LADDER_ID = '__own__';

const FALLBACK_CLASSIC: LadderConfig = {
  id: 'classic',
  name: 'Classic',
  currency: '$',
  prizes: [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000],
  safeHavens: [4, 9],
};

export type TimerMode = 'off' | 'clock' | 'custom';

export interface SetupChoices {
  lifelineIds: string[];
  ladder: LadderConfig;
  timerMode: TimerMode;
  customSeconds: number;
  shuffleAnswers: boolean;
}

/** Clock preset: 15s Q1-5, 30s Q6-10, 45s thereafter (scaled to ladder length). */
export function clockTimer(n: number): TimerConfig {
  const secondsPerQuestion = Array.from({ length: n }, (_, i) => {
    const f = n > 1 ? i / n : 0;
    return f < 1 / 3 ? 15 : f < 2 / 3 ? 30 : 45;
  });
  return { mode: 'clock', secondsPerQuestion, bankUnusedToLast: true, onTimeout: 'walk' };
}

export function customTimer(n: number, seconds: number): TimerConfig {
  const s = Math.max(5, Math.min(600, Math.round(seconds) || 30));
  return {
    mode: 'clock',
    secondsPerQuestion: Array.from({ length: n }, () => s),
    bankUnusedToLast: false,
    onTimeout: 'walk',
  };
}

export function buildTimer(mode: TimerMode, n: number, customSeconds: number): TimerConfig {
  if (mode === 'clock') return clockTimer(n);
  if (mode === 'custom') return customTimer(n, customSeconds);
  return { mode: 'off' };
}

/** Pick `n` questions from `qs`, spreading evenly when fewer are needed so difficulty still ramps. */
export function pickQuestions(qs: Question[], n: number): Question[] {
  if (n >= qs.length) return qs.slice();
  if (n <= 1) return qs.slice(0, n);
  return Array.from({ length: n }, (_, i) => qs[Math.round((i * (qs.length - 1)) / (n - 1))]!);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export interface BuildInput {
  bank?: QuestionBank;
  game?: CustomGame;
  choices: SetupChoices;
  allLifelines: LifelineDef[];
  seed: number;
}

/** Pure GameConfig builder (exported for tests). */
export function buildGameConfig(inp: BuildInput): GameConfig {
  const { bank, game, choices, allLifelines, seed } = inp;
  const src = game ?? bank;
  if (!src) throw new Error('No question source selected.');
  const n = choices.ladder.prizes.length;
  if (n > src.questions.length) {
    throw new Error(`This ladder needs ${n} questions but the set only has ${src.questions.length}.`);
  }
  const lifelines = allLifelines.filter((l) => choices.lifelineIds.includes(l.id));
  const cfg: GameConfig = {
    questions: pickQuestions(src.questions, n),
    spares: src.spares.slice(),
    ladder: choices.ladder,
    lifelines,
    timer: buildTimer(choices.timerMode, n, choices.customSeconds),
    shuffleAnswers: choices.shuffleAnswers,
    seed,
  };
  if (game) cfg.customGameId = game.id;
  else if (bank) cfg.sourceBankId = bank.id;
  return cfg;
}

function ladderSummary(l: LadderConfig): string {
  return `${l.prizes.length} questions, safe havens: ${
    l.safeHavens.length ? l.safeHavens.map((i) => i + 1).join(', ') : 'none'
  }`;
}

export const setupScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, params?: ScreenParams): () => void {
    let disposed = false;
    const el = h('main', { class: 'screen screen-setup' }, h('h1', null, 'Game Setup'));
    const body = h('div');
    el.appendChild(body);
    root.appendChild(el);
    const settings = ctx.getSettings();

    function fail(msg: string): void {
      clear(body);
      body.appendChild(h('p', { class: 'setup-error', role: 'alert' }, msg));
      body.appendChild(
        h('button', { class: 'btn', type: 'button', onclick: () => ctx.navigate('menu') }, 'Back to menu'),
      );
    }

    async function init(): Promise<void> {
      let bank: QuestionBank | undefined;
      let game: CustomGame | undefined;
      try {
        const customId = params?.customGameId;
        let bankId = params?.bankId;
        if (customId) {
          game = listCustomGames().find((g) => g.id === customId);
          if (!game) return fail('That custom game could not be found.');
        } else {
          if (!bankId && params?.random) bankId = randomBank().id;
          if (!bankId) bankId = ctx.devParams.bank;
          if (!bankId) return fail('No question set selected.');
          bank = await loadBank(bankId);
        }
      } catch (e) {
        if (!disposed) fail(`Could not load the question set: ${(e as Error).message}`);
        return;
      }
      if (disposed) return;
      render(bank, game);
    }

    function render(bank: QuestionBank | undefined, game: CustomGame | undefined): void {
      const title = game ? game.name : bank!.name;
      const source = game ?? bank!;
      const allLifelines: LifelineDef[] = [...BUILT_IN_LIFELINES, ...listCustomLifelines()];
      const onSet = new Set<string>(game ? game.lifelineIds : DEFAULT_ON_LIFELINES);

      // Ladder options
      const presets = (LADDER_PRESETS.length ? LADDER_PRESETS : [FALLBACK_CLASSIC]).filter(
        (l) => l.prizes.length <= source.questions.length,
      );
      const ladders: LadderConfig[] = [];
      if (game) ladders.push({ ...game.ladder, id: OWN_LADDER_ID, name: `${game.ladder.name} (this game's ladder)` });
      ladders.push(...presets);
      const defaultLadder = game
        ? OWN_LADDER_ID
        : (presets.find((l) => l.id === 'classic') ?? presets[0] ?? FALLBACK_CLASSIC).id;
      const ladderSel = h(
        'select',
        { id: 'setup-ladder' },
        ladders.map((l) => h('option', { value: l.id }, l.name)),
      ) as HTMLSelectElement;
      ladderSel.value = defaultLadder;
      const ladderInfo = h('p', { class: 'setup-summary', 'aria-live': 'polite' });
      const currentLadder = (): LadderConfig =>
        ladders.find((l) => l.id === ladderSel.value) ?? ladders[0]!;
      const showLadder = (): void => {
        ladderInfo.textContent = ladderSummary(currentLadder());
      };
      ladderSel.addEventListener('change', showLadder);
      showLadder();

      // Lifelines
      const boxes = new Map<string, HTMLInputElement>();
      const lifelineRows = allLifelines.map((l) => {
        const cb = h('input', {
          type: 'checkbox',
          id: `ll-${l.id}`,
          checked: onSet.has(l.id),
          'data-lifeline': l.id,
        }) as HTMLInputElement;
        cb.checked = onSet.has(l.id);
        boxes.set(l.id, cb);
        return h(
          'div',
          { class: 'toggle-row' },
          cb,
          h(
            'label',
            { for: `ll-${l.id}` },
            l.icon === l.name ? l.name : `${l.icon} ${l.name}`,
            l.builtIn ? null : h('span', { class: 'desc' }, ' (custom)'),
          ),
        );
      });

      // Timer
      const dt = settings.defaultTimer;
      let timerMode: TimerMode = dt.mode === 'clock' ? 'clock' : 'off';
      const secondsInput = h('input', {
        type: 'number',
        id: 'setup-seconds',
        min: '5',
        max: '600',
        value: '30',
      }) as HTMLInputElement;
      const secondsField = h(
        'div',
        { class: 'field' },
        h('label', { for: 'setup-seconds' }, 'Seconds per question'),
        secondsInput,
      );
      const timerRadios: HTMLInputElement[] = [];
      const timerOpts: [TimerMode, string, string][] = [
        ['off', 'Off', 'Take all the time you need.'],
        ['clock', 'Clock', '15s / 30s / 45s by stage; unused time banks for the last question; timeout walks away.'],
        ['custom', 'Custom', 'Same number of seconds for every question.'],
      ];
      const syncTimer = (): void => {
        secondsField.hidden = timerMode !== 'custom';
      };
      const timerRows = timerOpts.map(([val, label, desc]) => {
        const r = h('input', {
          type: 'radio',
          name: 'timer-mode',
          id: `timer-${val}`,
          value: val,
        }) as HTMLInputElement;
        r.checked = val === timerMode;
        r.addEventListener('change', () => {
          if (r.checked) {
            timerMode = val;
            syncTimer();
          }
        });
        timerRadios.push(r);
        return h(
          'div',
          { class: 'toggle-row' },
          r,
          h('label', { for: `timer-${val}` }, label, ' ', h('span', { class: 'desc' }, desc)),
        );
      });
      syncTimer();

      const shuffle = h('input', { type: 'checkbox', id: 'setup-shuffle' }) as HTMLInputElement;
      shuffle.checked = settings.shuffleAnswers;

      const err = h('p', { class: 'setup-error', role: 'alert' });
      const startBtn = h(
        'button',
        { class: 'btn btn-primary btn-large', type: 'button', id: 'setup-start' },
        'Start',
      ) as HTMLButtonElement;
      startBtn.addEventListener('click', () => {
        err.textContent = '';
        try {
          const choices: SetupChoices = {
            lifelineIds: [...boxes.entries()].filter(([, cb]) => cb.checked).map(([id]) => id),
            ladder: currentLadder().id === OWN_LADDER_ID ? game!.ladder : currentLadder(),
            timerMode,
            customSeconds: Number(secondsInput.value),
            shuffleAnswers: shuffle.checked,
          };
          const seed = ctx.devParams.seed ?? randomSeed();
          const config = buildGameConfig({ bank, game, choices, allLifelines, seed });
          ctx.navigate('game', { config });
        } catch (e) {
          err.textContent = (e as Error).message;
        }
      });

      clear(body);
      body.appendChild(
        h(
          'form',
          {
            class: 'setup-form',
            onsubmit: (e: Event) => {
              e.preventDefault();
              startBtn.click();
            },
          },
          h('p', { class: 'setup-summary' }, `Playing: ${title}`),
          h('fieldset', null, h('legend', null, 'Lifelines'), lifelineRows),
          h(
            'fieldset',
            null,
            h('legend', null, 'Prize ladder'),
            h('div', { class: 'field' }, h('label', { for: 'setup-ladder' }, 'Ladder'), ladderSel),
            ladderInfo,
          ),
          h('fieldset', null, h('legend', null, 'Timer'), timerRows, secondsField),
          h(
            'fieldset',
            null,
            h('legend', null, 'Answers'),
            h(
              'div',
              { class: 'toggle-row' },
              shuffle,
              h('label', { for: 'setup-shuffle' }, 'Shuffle answer order'),
            ),
          ),
          err,
          h(
            'div',
            { class: 'setup-actions' },
            h(
              'button',
              { class: 'btn', type: 'button', id: 'setup-back', onclick: () => ctx.navigate('menu') },
              'Back',
            ),
            startBtn,
          ),
        ),
      );
      startBtn.focus({ preventScroll: true });
    }

    body.appendChild(h('p', { class: 'setup-summary', role: 'status' }, 'Loading...'));
    void init();
    return () => {
      disposed = true;
      el.remove();
    };
  },
};
