// WP6: Game screen + controller. Wires the pure reducer to the DOM.
import '../../styles/game.css';
import type {
  AnswerIndex,
  AppContext,
  EffectResult,
  GameConfig,
  GameEvent,
  GameState,
  HistoryEntry,
  LifelineDef,
  Screen,
  ScreenParams,
} from '../../core/types';
import { createGame, reduce, select } from '../../core/engine';
import { createRng, type Rng } from '../../core/rng';
import { applyEffect } from '../../core/lifelines';
import { formatMoney, guaranteedAt } from '../../core/ladder';
import { saveGame, loadSavedGame, clearSavedGame } from '../../storage/savegame';
import { addHistory } from '../../storage/history';
import { flagQuestion } from '../../storage/customGames';
import { installKeyboard, type KeyboardHandlers } from '../keyboard';
import { h, clear, focusEl } from '../dom';
import { hexAnswer, updateHex, type HexState } from '../components/hexAnswer';
import { ladderPanel, type LadderPanelEl } from '../components/ladderPanel';
import { lifelineBar } from '../components/lifelineBar';
import {
  openModal,
  isModalOpen,
  confirmTopModal,
  closeAllModals,
} from '../components/modal';
import { audienceChart } from '../components/audienceChart';
import { phoneDialog } from '../components/phoneDialog';
import { timerRing, type TimerRing } from '../components/timerRing';
import { hostBubble, hostLine, type HostLineKey } from '../components/hostBubble';

/**
 * Keyboard handlers registered with installKeyboard() (names per src/ui/keyboard.ts): select(i), confirm,
 * cancel, fiftyFifty, phone, audience, switch, doubleDip (only while usable), custom(n 5..9), walk, ladder, mute.
 * Lifelines map to keys by built-in effect type; custom lifelines by position among non-built-ins.
 */

const TERMINAL: GameState['phase'][] = ['WON', 'GAME_OVER'];
const isTerminal = (s: GameState): boolean => TERMINAL.includes(s.phase) || s.outcome !== undefined;

function describeEffect(def: LifelineDef | undefined, fx: EffectResult | undefined): string {
  if (!def) return 'Lifeline used.';
  switch (def.effect) {
    case 'remove-wrong':
      return `${def.name}: ${fx?.eliminate?.length ?? def.params.n ?? 2} wrong answers removed.`;
    case 'skip-question':
      return `${def.name}: the question has been replaced.`;
    case 'second-chance':
      return `${def.name}: you may pick a second answer if your first is wrong.`;
    case 'extra-time':
      return `${def.name}: ${Math.round((fx?.addTimeMs ?? (def.params.seconds ?? 0) * 1000) / 1000)} seconds added.`;
    case 'audience-poll':
      return `${def.name}: the audience has voted.`;
    case 'friend-hint':
      return `${def.name}: your friend is on the line.`;
    default:
      return `${def.name}: the host offers a hint.`;
  }
}

export const gameScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, params?: ScreenParams): () => void {
    let disposed = false;
    let teardown: (() => void) | null = null;
    const host = h('div', { class: 'screen screen-game-host' });
    root.appendChild(host);

    function begin(config: GameConfig, resumed: GameState | null): void {
      if (disposed) return;
      teardown = runGame(host, ctx, config, resumed);
    }

    if (params?.config) {
      const cfg =
        ctx.devParams.seed !== undefined
          ? { ...params.config, seed: ctx.devParams.seed }
          : params.config;
      begin(cfg, null);
    } else if (params?.resume) {
      const saved = loadSavedGame();
      if (saved) begin(saved.config, saved);
      else ctx.navigate('menu');
    } else if (ctx.devParams.bank) {
      void devConfig(ctx.devParams.bank, ctx.devParams.seed).then(
        (cfg) => (cfg ? begin(cfg, null) : ctx.navigate('menu')),
        () => ctx.navigate('menu'),
      );
    } else {
      ctx.navigate('menu');
    }

    return () => {
      disposed = true;
      teardown?.();
      host.remove();
    };
  },
};

/** Dev/test: build a classic default game from ?bank=<id>&seed=<n>. */
async function devConfig(bankId: string, seed?: number): Promise<GameConfig | null> {
  const [{ loadBank }, { LADDER_PRESETS }, { BUILT_IN_LIFELINES }] = await Promise.all([
    import('../../data/bankLoader'),
    import('../../core/ladder'),
    import('../../core/lifelines'),
  ]);
  const bank = await loadBank(bankId);
  const ladder = LADDER_PRESETS[0];
  if (!ladder) return null;
  return {
    questions: bank.questions.slice(0, ladder.prizes.length),
    spares: bank.spares,
    ladder,
    lifelines: BUILT_IN_LIFELINES.filter(
      (l) => l.effect !== 'skip-question' && l.effect !== 'second-chance',
    ),
    timer: { mode: 'off' },
    shuffleAnswers: false,
    seed: seed ?? 1,
    sourceBankId: bank.id,
  };
}

function runGame(
  host: HTMLElement,
  ctx: AppContext,
  config: GameConfig,
  resumed: GameState | null,
): () => void {
  const ladderCfg = config.ladder;
  const N = ladderCfg.prizes.length;
  const money = (n: number): string => formatMoney(n, ladderCfg.currency);

  let state: GameState = resumed ?? createGame(config);
  const rng: Rng = createRng(config.seed, resumed?.rngState);
  let disposed = false;
  let recorded = false;
  let lastSave = 0;
  let timerTotal = 0;
  let stageKey = '';
  let lastEnter = '';
  let updateDoubleDipKey: () => void = () => {};
  let flagged = false;
  let endShown = false;
  const timeouts = new Set<number>();
  let raf = 0;
  let lastFrame = 0;
  let lastTickSec = -1;

  const later = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  };
  const clearLater = (): void => {
    timeouts.forEach((t) => window.clearTimeout(t));
    timeouts.clear();
  };

  // ------------------------------------------------------------ static layout
  const host$ = hostBubble();
  host$.setEnabled(ctx.getSettings().hostCommentary);
  const ring: TimerRing | null = config.timer.mode === 'clock' ? timerRing() : null;
  const ladder: LadderPanelEl = ladderPanel({ ladder: ladderCfg, qIndex: state.qIndex });
  const infoPrize = h('span', { class: 'info-prize' });
  const infoSafe = h('span', { class: 'info-safe' });
  const qNum = h('span', { class: 'q-num' });
  const questionText = h('p', { class: 'question-text' });
  const questionBox = h(
    'div',
    { class: 'hex hex-question', tabindex: '-1' },
    h('div', { class: 'hex-inner' }, qNum, questionText),
  );
  const answersEl = h('div', { class: 'answers' });
  const lifelineSlot = h('div', { class: 'lifeline-slot' });
  const panelSlot = h('div', { class: 'effect-panel-slot' });
  const bannerSlot = h('div', { class: 'banner-slot', role: 'status' });
  const walkBtn = h('button', { type: 'button', class: 'btn btn--ghost walk-btn' }, 'Walk away');
  const reportBtn = h(
    'button',
    { type: 'button', class: 'btn btn--ghost report-btn' },
    'Report question',
  );
  const quitBtn = h('button', { type: 'button', class: 'btn btn--ghost quit-btn' }, 'Save & quit');
  const ladderBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--ghost ladder-toggle',
      'aria-expanded': 'false',
      'aria-controls': 'game-ladder',
    },
    'Ladder',
  );
  const ladderAside = h(
    'aside',
    { class: 'ladder', id: 'game-ladder', 'aria-label': 'Prize ladder' },
    ladder,
  );
  let hexes: HTMLElement[] = [];

  const stage = h(
    'section',
    { class: 'stage', 'aria-label': 'Question' },
    h('div', { class: 'stage-top' }, ring ? ring.el : null, host$.el),
    h('div', { class: 'info-bar' }, infoPrize, infoSafe),
    questionBox,
    answersEl,
    panelSlot,
    bannerSlot,
    lifelineSlot,
    h('div', { class: 'stage-actions' }, walkBtn, reportBtn),
  );
  const top = h(
    'header',
    { class: 'game-top' },
    quitBtn,
    h('span', { class: 'game-title' }, 'Millionaire Quiz'),
    ladderBtn,
  );
  const main = h(
    'main',
    { class: 'screen screen-game' },
    top,
    h('div', { class: 'game-body' }, stage, ladderAside),
  );
  clear(host);
  host.appendChild(main);

  // ------------------------------------------------------------ dispatch
  function dispatch(ev: GameEvent): void {
    const before = state;
    let next = reduce(state, ev, rng);
    if (next === before) return;
    next = { ...next, rngState: rng.getState() };
    state = next;
    if (ev.type === 'TICK') {
      onTick();
      return;
    }
    persist();
    render();
  }

  const enterKeyOf = (s: GameState): string => `${s.phase}|${s.qIndex}|${s.current.id}`;

  function persist(): void {
    if (isTerminal(state)) {
      clearSavedGame();
      return;
    }
    if (state.phase === 'INTRO') return;
    try {
      saveGame(state);
      lastSave = Date.now();
    } catch {
      /* storage failures must not break play */
    }
  }

  function onTick(): void {
    const s = state;
    if (ring && s.timeLeftMs !== undefined) {
      if (s.timeLeftMs > timerTotal) timerTotal = s.timeLeftMs;
      ring.update(s.timeLeftMs, timerTotal);
      const sec = Math.ceil(s.timeLeftMs / 1000);
      if (sec !== lastTickSec) {
        lastTickSec = sec;
        if (sec <= 10 && sec > 0) ctx.sound.play('tick');
        if (sec === 10 || sec === 5) ctx.announce(`${sec} seconds left`);
      }
      if (
        s.timeLeftMs <= 0 &&
        !isTerminal(s) &&
        (s.phase === 'AWAITING' || s.phase === 'CONFIRMING')
      ) {
        dispatch({ type: 'TIMEOUT' });
        return;
      }
    }
    if (Date.now() - lastSave > 2500) persist();
    if (enterKeyOf(s) !== lastEnter) render();
  }

  function frame(t: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(250, t - (lastFrame || t));
    lastFrame = t;
    if (dt <= 0) return;
    const p = state.phase;
    if (p === 'AWAITING' || p === 'CONFIRMING') dispatch({ type: 'TICK', dtMs: dt });
  }

  // ------------------------------------------------------------ actions
  function pick(i: AnswerIndex): void {
    if (state.phase !== 'AWAITING' || state.eliminated.includes(i)) return;
    ctx.sound.play('select');
    dispatch({ type: 'SELECT', index: i });
  }
  function useLifeline(id: string): void {
    if (state.phase !== 'AWAITING') return;
    if (!select.availableLifelines(state).some((l) => l.id === id)) return;
    const def = config.lifelines.find((l) => l.id === id);
    const before = state;
    dispatch({ type: 'USE_LIFELINE', lifelineId: id });
    if (state === before || !def) return;
    ctx.sound.play('lifeline');
    // Fallback: if the reducer did not resolve the effect itself, apply it here for display + state.
    if ((state.phase as string) === 'LIFELINE' && !state.lastEffect) {
      try {
        const fx = applyEffect(def, state, rng);
        state = mergeEffect(state, fx);
        render();
      } catch {
        /* ignore */
      }
    }
    ctx.announce(describeEffect(def, state.lastEffect));
  }
  function mergeEffect(s: GameState, fx: EffectResult): GameState {
    const eliminated = fx.eliminate
      ? Array.from(new Set([...s.eliminated, ...fx.eliminate]))
      : s.eliminated;
    return {
      ...s,
      eliminated,
      current: fx.replaceQuestion ?? s.current,
      timeLeftMs:
        fx.addTimeMs && s.timeLeftMs !== undefined ? s.timeLeftMs + fx.addTimeMs : s.timeLeftMs,
      lastEffect: fx,
      activeEffects: {
        ...s.activeEffects,
        secondChanceArmed: fx.armSecondChance ? true : s.activeEffects.secondChanceArmed,
        audiencePoll: fx.poll ?? s.activeEffects.audiencePoll,
        friendHint:
          fx.hint &&
          s.activeLifelineId &&
          config.lifelines.find((l) => l.id === s.activeLifelineId)?.effect === 'friend-hint'
            ? fx.hint
            : s.activeEffects.friendHint,
        hostHint:
          fx.hint &&
          s.activeLifelineId &&
          config.lifelines.find((l) => l.id === s.activeLifelineId)?.effect === 'host-hint'
            ? fx.hint
            : s.activeEffects.hostHint,
      },
    };
  }
  function walk(): void {
    if (state.phase !== 'AWAITING' || !select.canWalk(state)) return;
    dispatch({ type: 'WALK_AWAY' });
  }
  function suspenseMs(): number {
    const base = ctx.getSettings().revealDelayMs;
    const f = 0.6 + 1.0 * (N > 1 ? state.qIndex / (N - 1) : 1);
    const ms = base * f;
    return ctx.reducedMotion() ? Math.min(ms, 400) : ms;
  }

  // ------------------------------------------------------------ modals
  async function confirmModal(): Promise<void> {
    const sel = state.selected;
    if (sel === undefined) return;
    const letter = 'ABCD'[sel];
    host$.say(hostLine('final', { n: String(state.qIndex) }));
    const v = await openModal({
      title: 'Final answer?',
      body: h('p', null, `${letter}: ${state.current.answers[sel]}`),
      actions: [
        { label: 'Not yet', value: 'cancel' },
        { label: 'Final answer', value: 'final', primary: true },
      ],
    });
    if (disposed || state.phase !== 'CONFIRMING') return;
    if (v === 'final') dispatch({ type: 'FINAL_ANSWER' });
    else dispatch({ type: 'CANCEL' });
  }
  async function walkModal(): Promise<void> {
    const amount = money(select.prize(state));
    const v = await openModal({
      title: 'Walk away?',
      body: h('p', null, `You will leave with ${amount}.`),
      actions: [
        { label: 'Keep playing', value: 'cancel' },
        { label: `Walk away with ${amount}`, value: 'walk', primary: true },
      ],
    });
    if (disposed || state.phase !== 'WALK_CONFIRM') return;
    dispatch({ type: v === 'walk' ? 'CONFIRM' : 'CANCEL' });
  }
  // ------------------------------------------------------------ rendering
  function hexStateFor(i: number): HexState {
    const s = state;
    if (s.eliminated.includes(i) && !(s.phase === 'WRONG' || s.phase === 'GAME_OVER'))
      return 'eliminated';
    if (s.phase === 'WRONG' && !s.outcome) {
      // Double Dip first miss: do not reveal the right answer.
      if (i === s.selected) return 'wrong';
      return s.eliminated.includes(i) ? 'eliminated' : 'idle';
    }
    const reveal =
      s.phase === 'CORRECT' ||
      s.phase === 'WRONG' ||
      s.phase === 'WON' ||
      s.phase === 'GAME_OVER' ||
      s.phase === 'MILESTONE';
    if (reveal && s.selected !== undefined) {
      const correct = s.current.correct;
      if (i === correct) return 'correct';
      if (i === s.selected) return 'wrong';
      return s.eliminated.includes(i) ? 'eliminated' : 'idle';
    }
    if (s.selected === i && (s.phase === 'CONFIRMING' || s.phase === 'LOCKED')) return 'selected';
    return s.eliminated.includes(i) ? 'eliminated' : 'idle';
  }

  function ensureStage(): void {
    const key = `${state.qIndex}|${state.current.id}`;
    if (key === stageKey) return;
    stageKey = key;
    flagged = false;
    clear(answersEl);
    hexes = [0, 1, 2, 3].map((i) =>
      hexAnswer({
        index: i as AnswerIndex,
        text: state.current.answers[i],
        state: 'idle',
        onPick: pick,
      }),
    );
    hexes.forEach((hx) => answersEl.appendChild(hx));
    if (ring && state.timeLeftMs !== undefined) {
      timerTotal = state.timeLeftMs;
    }
    qNum.textContent = `Question ${state.qIndex + 1} of ${N}`;
    questionText.textContent = state.current.text;
    reportBtn.textContent = 'Report question';
    reportBtn.removeAttribute('disabled');
  }

  function renderPanel(): void {
    clear(panelSlot);
    const s = state;
    const fx = s.activeEffects;
    const parts: Node[] = [];
    if (fx.audiencePoll)
      parts.push(
        h(
          'div',
          { class: 'effect-card' },
          h('h3', null, 'Ask the audience'),
          audienceChart(fx.audiencePoll),
        ),
      );
    if (fx.friendHint)
      parts.push(
        h(
          'div',
          { class: 'effect-card' },
          h('h3', null, 'Phone a friend'),
          phoneDialog(fx.friendHint, s.current.answers),
        ),
      );
    if (fx.hostHint)
      parts.push(
        h(
          'div',
          { class: 'effect-card' },
          h('h3', null, 'Host hint'),
          phoneDialog(fx.hostHint, s.current.answers, 'Host'),
        ),
      );
    if (s.activeEffects.secondChanceArmed)
      parts.push(
        h(
          'p',
          { class: 'effect-note' },
          '✔ Second chance armed: you may answer twice on this question.',
        ),
      );
    if (s.phase === 'LIFELINE') {
      const def = config.lifelines.find((l) => l.id === s.activeLifelineId);
      parts.push(h('p', { class: 'effect-note' }, describeEffect(def, s.lastEffect)));
      parts.push(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--primary',
            dataset: { act: 'lifeline-done' },
            onclick: () => dispatch({ type: 'LIFELINE_DONE' }),
          },
          'Continue',
        ),
      );
    }
    parts.forEach((p) => panelSlot.appendChild(p));
  }

  function banner(
    text: string,
    cls: string,
    btn?: { label: string; act: string; fn: () => void },
  ): HTMLElement {
    clear(bannerSlot);
    const b = h(
      'div',
      { class: `banner ${cls}` },
      h('p', { class: 'banner-text' }, text),
      btn
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn--primary',
              dataset: { act: btn.act },
              onclick: btn.fn,
            },
            btn.label,
          )
        : null,
    );
    bannerSlot.appendChild(b);
    return b;
  }

  function render(): void {
    if (disposed) return;
    const s = state;
    ensureStage();
    const enterKey = enterKeyOf(s);
    const entered = enterKey !== lastEnter;
    const prevPhase = lastEnter.split('|')[0];
    lastEnter = enterKey;

    ladder.update(s.qIndex);
    ladderAside.dataset.q = String(s.qIndex);
    infoPrize.textContent = `Playing for ${money(ladderCfg.prizes[s.qIndex] ?? 0)}`;
    const g = guaranteedAt(ladderCfg, s.phase === 'MILESTONE' ? s.qIndex + 1 : s.qIndex);
    infoSafe.textContent = `Guaranteed: ${money(g)}`;

    const pending = s.phase === 'INTRO' || s.phase === 'PRESENTING';
    const locked = s.phase !== 'AWAITING';
    hexes.forEach((hx, i) =>
      updateHex(hx, {
        index: i as AnswerIndex,
        text: s.current.answers[i],
        state: hexStateFor(i),
        disabled: locked,
        pending,
        onPick: pick,
      }),
    );
    answersEl.classList.toggle('answers--pending', pending);
    questionBox.dataset.phase = s.phase;

    clear(lifelineSlot);
    const avail = s.phase === 'AWAITING' ? select.availableLifelines(s).map((l) => l.id) : [];
    lifelineSlot.appendChild(
      lifelineBar({
        lifelines: config.lifelines,
        uses: s.lifelineUses,
        available: avail,
        onUse: useLifeline,
      }),
    );
    const canWalk = s.phase === 'AWAITING' && select.canWalk(s);
    walkBtn.disabled = !canWalk;
    walkBtn.textContent = canWalk ? `Walk away (${money(select.prize(s))})` : 'Walk away';
    quitBtn.disabled = isTerminal(s);

    renderPanel();
    updateDoubleDipKey();
    if (
      !isTerminal(s) &&
      s.phase !== 'MILESTONE' &&
      s.phase !== 'CORRECT' &&
      s.phase !== 'WRONG' &&
      s.phase !== 'INTRO'
    )
      clear(bannerSlot);

    if (ring) {
      ring.el.hidden = s.timeLeftMs === undefined;
      if (s.timeLeftMs !== undefined) ring.update(s.timeLeftMs, Math.max(timerTotal, s.timeLeftMs));
    }

    if (entered) onEnter(prevPhase);
  }

  function onEnter(prevPhase: string): void {
    const s = state;
    if (s.phase !== 'CONFIRMING' && isModalOpen() && s.phase !== 'WALK_CONFIRM') closeAllModals();
    switch (s.phase) {
      case 'INTRO':
        banner(`Playing for ${money(ladderCfg.prizes[N - 1])}. Ready?`, 'banner--intro', {
          label: 'Start game',
          act: 'start',
          fn: () => {
            ctx.sound.unlock();
            dispatch({ type: 'START' });
          },
        });
        host$.say(hostLine('intro', { prize: money(ladderCfg.prizes[N - 1]) }));
        later(() => focusEl(bannerSlot.querySelector('button')), 0);
        break;
      case 'PRESENTING': {
        clear(bannerSlot);
        host$.say('');
        ctx.sound.play('bed-start');
        ctx.announce(
          `Question ${s.qIndex + 1} for ${money(ladderCfg.prizes[s.qIndex] ?? 0)}. ${s.current.text}`,
          false,
        );
        later(() => dispatch({ type: 'ANSWERS_REVEALED' }), ctx.reducedMotion() ? 200 : 1600);
        break;
      }
      case 'AWAITING': {
        if (prevPhase === 'PRESENTING') {
          ctx.announce(
            `Answers: ${s.current.answers.map((a, i) => `${'ABCD'[i]}, ${a}`).join('. ')}`,
          );
        } else if (prevPhase === 'LOCKED') {
          ctx.announce('Not correct, but your second chance is active. Choose again.', true);
          host$.say('Second chance! Choose another answer.');
        }
        later(() => {
          const first = hexes.find((_, i) => !s.eliminated.includes(i)) ?? null;
          if (!isModalOpen())
            focusEl(
              prevPhase === 'LIFELINE'
                ? (lifelineSlot.querySelector<HTMLElement>('button:not([disabled])') ?? first)
                : first,
            );
        }, 0);
        break;
      }
      case 'LIFELINE':
        later(() => focusEl(panelSlot.querySelector('button')), 0);
        break;
      case 'CONFIRMING':
        void confirmModal();
        break;
      case 'LOCKED':
        ctx.sound.play('final');
        ctx.announce(
          `Final answer: ${'ABCD'[s.selected ?? 0]}. ${s.current.answers[s.selected ?? 0]}`,
        );
        later(() => dispatch({ type: 'REVEAL' }), suspenseMs());
        break;
      case 'CORRECT': {
        ctx.sound.play('bed-stop');
        ctx.sound.play('correct');
        const last = s.qIndex >= N - 1;
        const txt = hostLine('correct', { n: String(s.qIndex) });
        host$.say(txt);
        ctx.announce(`Correct! ${txt}`, true);
        banner(`Correct! ${money(ladderCfg.prizes[s.qIndex] ?? 0)}`, 'banner--correct', {
          label: last ? 'Claim your prize' : 'Next question',
          act: 'next',
          fn: () => dispatch({ type: 'NEXT' }),
        });
        later(() => focusEl(bannerSlot.querySelector('button')), 0);
        break;
      }
      case 'WRONG': {
        if (!s.outcome) {
          ctx.sound.play('wrong');
          host$.say('Not that one, but you have a second chance!');
          ctx.announce('Not correct, but Double Dip gives you a second chance.', true);
          banner('Not correct, but Double Dip gives you a second chance.', 'banner--wrong', {
            label: 'Try again',
            act: 'next',
            fn: () => dispatch({ type: 'NEXT' }),
          });
          later(() => focusEl(bannerSlot.querySelector('button')), 0);
          break;
        }
        ctx.sound.play('bed-stop');
        ctx.sound.play('wrong');
        const exp = s.current.explanation ? ` ${s.current.explanation}` : '';
        const prize = s.winnings ?? guaranteedAt(ladderCfg, s.qIndex);
        host$.say(hostLine('lose', { amount: money(prize) }));
        ctx.announce(
          `Wrong. The correct answer was ${'ABCD'[s.current.correct]}, ${s.current.answers[s.current.correct]}.${exp}`,
          true,
        );
        if (!isTerminal(s)) {
          banner(`Wrong answer.${exp}`, 'banner--wrong', {
            label: 'Continue',
            act: 'next',
            fn: () => dispatch({ type: 'NEXT' }),
          });
          later(() => focusEl(bannerSlot.querySelector('button')), 0);
        } else {
          finish();
        }
        break;
      }
      case 'MILESTONE': {
        ctx.sound.play('milestone');
        const cleared = ladderCfg.safeHavens.includes(s.qIndex) ? s.qIndex : s.qIndex - 1;
        const amount = money(ladderCfg.prizes[Math.max(0, cleared)] ?? 0);
        const txt = hostLine('milestone', { amount, n: String(s.qIndex) });
        host$.say(txt);
        ctx.announce(`Safe haven reached. ${amount} guaranteed.`, true);
        banner(`Safe haven reached: ${amount} guaranteed!`, 'banner--milestone', {
          label: 'Continue',
          act: 'next',
          fn: () => dispatch({ type: 'NEXT' }),
        });
        later(() => focusEl(bannerSlot.querySelector('button')), 0);
        break;
      }
      case 'WALK_CONFIRM':
        void walkModal();
        break;
      case 'WON':
      case 'GAME_OVER':
        finish();
        break;
      default:
        break;
    }
  }

  function finish(): void {
    if (endShown) return;
    endShown = true;
    clearLater();
    cancelAnimationFrame(raf);
    closeAllModals();
    const s = state;
    const winnings = s.winnings ?? 0;
    const outcome = s.outcome ?? (s.phase === 'WON' ? 'won' : 'wrong');
    if (!recorded) {
      recorded = true;
      const entry: HistoryEntry = {
        id: `${s.startedAt}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        date: new Date().toISOString(),
        bankId: config.sourceBankId,
        customGameId: config.customGameId,
        reachedQ: s.qIndex,
        outcome,
        winnings,
        lifelinesUsed: s.lifelinesUsed,
        durationMs: Math.max(0, Date.now() - s.startedAt),
        currency: ladderCfg.currency,
      };
      try {
        addHistory(entry);
      } catch {
        /* ignore */
      }
      clearSavedGame();
    }
    ctx.sound.play('bed-stop');
    let msg: string;
    let key: HostLineKey = 'lose';
    if (outcome === 'won') {
      ctx.sound.play('win');
      key = 'win';
      msg = `You won ${money(winnings)}!`;
    } else if (outcome === 'walked') {
      key = 'walk';
      msg = `You walked away with ${money(winnings)}.`;
    } else if (outcome === 'timeout') {
      msg = `Time's up! You leave with ${money(winnings)}.`;
    } else {
      msg = `Game over. You leave with ${money(winnings)}.`;
    }
    host$.say(hostLine(key, { amount: money(winnings) }));
    ctx.announce(msg, true);
    banner(msg, `banner--end banner--${outcome}`, {
      label: 'See results',
      act: 'results',
      fn: () => ctx.navigate('results', { finalState: state }),
    });
    later(() => focusEl(bannerSlot.querySelector('button')), 0);
  }

  // ------------------------------------------------------------ wiring
  walkBtn.addEventListener('click', walk);
  quitBtn.addEventListener('click', () => {
    persist();
    ctx.navigate('menu');
  });
  reportBtn.addEventListener('click', () => {
    if (flagged) return;
    flagged = true;
    try {
      flagQuestion(state.current.id);
    } catch {
      /* ignore */
    }
    reportBtn.textContent = 'Reported ✓';
    reportBtn.setAttribute('disabled', '');
    ctx.announce('Question reported. Thank you.');
  });
  const setLadder = (open: boolean): void => {
    ladderAside.classList.toggle('ladder--open', open);
    ladderBtn.setAttribute('aria-expanded', String(open));
  };
  ladderBtn.addEventListener('click', () =>
    setLadder(!ladderAside.classList.contains('ladder--open')),
  );

  const KEY_FOR_EFFECT: Partial<Record<LifelineDef['effect'], string>> = {
    'remove-wrong': 'fiftyFifty',
    'friend-hint': 'phone',
    'audience-poll': 'audience',
    'skip-question': 'switch',
    'second-chance': 'doubleDip',
  };
  const keyHandlers: KeyboardHandlers = {
    select: (i) => {
      if (!isModalOpen() && i !== undefined) pick(i as AnswerIndex);
    },
    confirm: () => {
      if (isModalOpen()) confirmTopModal();
      else if (state.phase === 'INTRO')
        bannerSlot.querySelector<HTMLElement>('[data-act="start"]')?.click();
      else if (['CORRECT', 'MILESTONE', 'WRONG', 'LIFELINE'].includes(state.phase)) {
        (
          bannerSlot.querySelector('button') ?? panelSlot.querySelector<HTMLElement>('[data-act]')
        )?.click();
      } else if (isTerminal(state)) ctx.navigate('results', { finalState: state });
    },
    cancel: () => {
      if (isModalOpen()) return; // modal handles Esc itself; avoid double handling
      if (ladderAside.classList.contains('ladder--open')) setLadder(false);
    },
    walk,
    ladder: () => setLadder(!ladderAside.classList.contains('ladder--open')),
    mute: () => {
      const muted = !ctx.getSettings().muted;
      ctx.updateSettings({ muted });
      ctx.announce(muted ? 'Sound muted' : 'Sound on');
    },
    custom: (n) => {
      if (isModalOpen() || n === undefined) return;
      const def = config.lifelines.filter((l) => !l.builtIn)[n - 5];
      if (def) useLifeline(def.id);
    },
  };
  // Built-in lifeline keys (F/P/U/S/D) are registered per effect; 'doubleDip' is only registered while
  // that lifeline is usable so that D still selects answer D otherwise (see updateDoubleDipKey()).
  for (const def of config.lifelines) {
    const k = def.builtIn ? KEY_FOR_EFFECT[def.effect] : undefined;
    if (k && k !== 'doubleDip' && !keyHandlers[k])
      keyHandlers[k] = () => {
        if (!isModalOpen()) useLifeline(def.id);
      };
  }
  const dipDef = config.lifelines.find((l) => l.builtIn && l.effect === 'second-chance');
  updateDoubleDipKey = (): void => {
    const usable =
      !!dipDef &&
      state.phase === 'AWAITING' &&
      select.availableLifelines(state).some((l) => l.id === dipDef.id);
    if (usable) keyHandlers.doubleDip = () => !isModalOpen() && useLifeline(dipDef.id);
    else delete keyHandlers.doubleDip;
  };
  const removeKeys = installKeyboard(keyHandlers);

  // ------------------------------------------------------------ boot
  render();
  if (config.timer.mode === 'clock') raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    clearLater();
    cancelAnimationFrame(raf);
    closeAllModals();
    removeKeys();
    if (!isTerminal(state)) persist();
  };
}
