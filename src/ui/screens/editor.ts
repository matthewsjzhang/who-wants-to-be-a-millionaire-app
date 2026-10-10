// WP8: custom game editor.
import '../../styles/editor.css';
import type {
  AnswerIndex,
  AppContext,
  Currency,
  CustomGame,
  Difficulty,
  LadderConfig,
  LifelineDef,
  Question,
  Screen,
  ScreenParams,
  TimerConfig,
} from '../../core/types';
import { LADDER_PRESETS, formatMoney, validateLadder } from '../../core/ladder';
import { BUILT_IN_LIFELINES, DEFAULT_LIFELINE_IDS } from '../../core/lifelines';
import { validateCustomGame } from '../../data/schema';
import {
  deleteLifeline,
  listCustomGames,
  listCustomLifelines,
  upsertCustomGame,
  upsertLifeline,
} from '../../storage/customGames';
import { exportJSON, importJSON } from '../../storage/io';
import { h, clear } from '../dom';
import { EFFECT_LABELS, lifelineEditor } from '../components/lifelineEditor';

const MAX_RUNGS = 20;
const LETTERS = ['A', 'B', 'C', 'D'];
const CURRENCIES: Currency[] = ['$', '£', '€', 'pts'];
const CLASSIC_PRIZES = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];

type ListKey = 'questions' | 'spares';

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 7)}`;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function safeList(fn: () => string[]): string[] {
  try {
    return fn() ?? [];
  } catch {
    return [];
  }
}

export function classicLadder(): LadderConfig {
  const preset = LADDER_PRESETS.find((p) => p.id === 'classic') ?? LADDER_PRESETS[0];
  if (preset) return clone(preset);
  return { id: 'classic', name: 'Classic', currency: '$', prizes: [...CLASSIC_PRIZES], safeHavens: [4, 9] };
}

function difficultyFor(index: number, len: number): Difficulty {
  return Math.min(5, 1 + Math.floor((index * 5) / Math.max(1, len))) as Difficulty;
}

function blankQuestion(prefix: string, difficulty: Difficulty): Question {
  return { id: uid(prefix), text: '', answers: ['', '', '', ''], correct: 0, difficulty };
}

function clockSeconds(i: number): number {
  return i < 5 ? 15 : i < 10 ? 30 : 45;
}

/** Local per-question problems (always checked; independent of the schema validator). */
export function questionIssues(q: Question): string[] {
  const out: string[] = [];
  if (!q.text.trim()) out.push('Question text is required.');
  q.answers.forEach((a, i) => {
    if (!a.trim()) out.push(`Answer ${LETTERS[i]} is empty.`);
  });
  const norm = q.answers.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (new Set(norm).size !== norm.length) out.push('Answers must be different from each other.');
  return out;
}

export function localLadderErrors(l: LadderConfig): string[] {
  const out: string[] = [];
  if (l.prizes.length < 1 || l.prizes.length > MAX_RUNGS) out.push(`Ladder needs 1 to ${MAX_RUNGS} rungs.`);
  l.prizes.forEach((p, i) => {
    if (!Number.isFinite(p) || p <= 0) out.push(`Rung ${i + 1}: prize must be greater than 0.`);
    else if (i > 0 && p <= l.prizes[i - 1]) out.push(`Rung ${i + 1}: prize must be higher than rung ${i}.`);
  });
  return out;
}

function money(n: number, c: Currency): string {
  try {
    return formatMoney(n, c);
  } catch {
    return c === 'pts' ? `${n} pts` : `${c}${n.toLocaleString('en-US')}`;
  }
}

function newGame(): CustomGame {
  const ladder = classicLadder();
  const now = new Date().toISOString();
  return {
    id: uid('game'),
    name: '',
    createdAt: now,
    updatedAt: now,
    questions: ladder.prizes.map((_, i) => blankQuestion('q', difficultyFor(i, ladder.prizes.length))),
    spares: [],
    ladder,
    lifelineIds: [...DEFAULT_LIFELINE_IDS],
    timer: { mode: 'off' },
  };
}

function download(filename: string, text: string): boolean {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export const editorScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, params?: ScreenParams): () => void {
    const existing = params?.editId ? listCustomGames().find((g) => g.id === params.editId) : undefined;
    const game: CustomGame = existing ? clone(existing) : newGame();
    const isNew = !existing;
    const expanded = new Set<string>();
    let customLifelines: LifelineDef[] = listCustomLifelines();
    let lifelineForm: { initial?: LifelineDef } | null = null;
    let pendingDelete: string | null = null;
    let statusMsg = '';
    let updaters: Array<() => void> = [];
    let disposed = false;

    const el = h('main', { class: 'screen screen-editor' });
    root.appendChild(el);

    const builtIns = (): LifelineDef[] => BUILT_IN_LIFELINES;

    // ---------------------------------------------------------------- validation
    let valBox: HTMLElement = h('div');

    function validation(): { errors: string[]; warnings: string[] } {
      const errors: string[] = [];
      const warnings: string[] = [];
      if (!game.name.trim()) errors.push('Give the game a name.');
      const bad = [...game.questions.map((q, i) => ({ q, label: `Question ${i + 1}` })), ...game.spares.map((q, i) => ({ q, label: `Spare ${i + 1}` }))].filter(
        ({ q }) => questionIssues(q).length > 0,
      );
      if (bad.length) errors.push(`${bad.length} question${bad.length === 1 ? '' : 's'} need attention: ${bad.map((b) => b.label).join(', ')}.`);
      const ladderErrs = Array.from(new Set([...localLadderErrors(game.ladder), ...safeList(() => validateLadder(game.ladder))]));
      ladderErrs.forEach((e) => errors.push(`Ladder: ${e}`));
      if (game.questions.length !== game.ladder.prizes.length) errors.push('Question count must match ladder length.');
      try {
        const r = validateCustomGame(game);
        r.errors.forEach((e) => {
          if (!errors.includes(e)) errors.push(e);
        });
        warnings.push(...r.warnings);
      } catch {
        /* validator unavailable */
      }
      if (game.lifelineIds.length === 0) warnings.push('No lifelines selected.');
      if (game.spares.length === 0) warnings.push('No spare questions: the Switch lifeline will have nothing to swap in.');
      return { errors, warnings };
    }

    function renderValidation(): void {
      const { errors, warnings } = validation();
      clear(valBox);
      valBox.className = errors.length ? 'ed-errors' : 'ed-ok';
      valBox.appendChild(
        h('h2', { class: 'ed-sub' }, errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix` : 'Ready to save'),
      );
      if (errors.length) valBox.appendChild(h('ul', null, errors.map((e) => h('li', null, e))));
      if (warnings.length) {
        valBox.appendChild(h('p', { class: 'ed-hint' }, 'Warnings'));
        valBox.appendChild(h('ul', { class: 'ed-warn' }, warnings.map((w) => h('li', null, w))));
      }
      if (statusMsg) valBox.appendChild(h('p', { class: 'ed-status', role: 'status' }, statusMsg));
    }

    function refresh(): void {
      updaters.forEach((u) => u());
      renderValidation();
    }

    // ---------------------------------------------------------------- structural ops
    function resizeTimer(): void {
      if (game.timer.mode !== 'clock') return;
      const n = game.ladder.prizes.length;
      const arr = game.timer.secondsPerQuestion.slice(0, n);
      while (arr.length < n) arr.push(clockSeconds(arr.length));
      game.timer.secondsPerQuestion = arr;
    }

    function syncRungs(): void {
      const n = game.ladder.prizes.length;
      while (game.questions.length > n) game.questions.pop();
      while (game.questions.length < n) game.questions.push(blankQuestion('q', difficultyFor(game.questions.length, n)));
      game.ladder.safeHavens = game.ladder.safeHavens.filter((s) => s >= 0 && s < n);
      resizeTimer();
    }

    function appendRung(): void {
      const p = game.ladder.prizes;
      const last = p.length ? p[p.length - 1] : 0;
      p.push(Math.max(last + 1, Math.round((last * 1.5) / 100) * 100 || last + 1));
    }

    function addQuestion(): Question | null {
      if (game.ladder.prizes.length >= MAX_RUNGS) return null;
      appendRung();
      markCustomLadder();
      const q = blankQuestion('q', 5);
      game.questions.push(q);
      q.difficulty = difficultyFor(game.questions.length - 1, game.questions.length);
      syncRungs();
      expanded.add(q.id);
      return q;
    }

    function markCustomLadder(): void {
      if (game.ladder.id !== 'custom') {
        game.ladder.id = 'custom';
        game.ladder.name = game.ladder.name || 'Custom';
      }
    }

    function applyPreset(id: string): void {
      if (id === 'custom') {
        markCustomLadder();
        return;
      }
      const preset = LADDER_PRESETS.find((p) => p.id === id) ?? (id === 'classic' ? classicLadder() : undefined);
      if (!preset) return;
      const keepCurrency = game.ladder.currency;
      game.ladder = clone(preset);
      if (!CURRENCIES.includes(game.ladder.currency)) game.ladder.currency = keepCurrency;
      // Re-map questions: grow with blanks / truncate from the top.
      syncRungs();
      ctx.announce(`Ladder preset ${preset.name} applied. ${game.questions.length} questions.`);
    }

    function move(list: Question[], i: number, d: -1 | 1): void {
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    }

    // ---------------------------------------------------------------- focus restore
    function activeKey(): string | null {
      const a = document.activeElement as HTMLElement | null;
      return a && el.contains(a) ? (a.getAttribute('data-fk') ?? (a.id || null)) : null;
    }
    function restoreFocus(key: string | null): void {
      if (!key) return;
      const find = (k: string): HTMLElement | null =>
        el.querySelector<HTMLElement>(`[data-fk="${k}"]`) ?? (document.getElementById(k) && el.contains(document.getElementById(k)) ? document.getElementById(k) : null);
      const tryFocus = (k: string): boolean => {
        const t = find(k) as HTMLButtonElement | null;
        if (t && !t.disabled) {
          t.focus({ preventScroll: true });
          return true;
        }
        return false;
      };
      if (tryFocus(key)) return;
      if (key.endsWith(':up') && tryFocus(key.replace(/:up$/, ':down'))) return;
      if (key.endsWith(':down')) tryFocus(key.replace(/:down$/, ':up'));
    }

    function rerender(focusKey?: string | null): void {
      if (disposed) return;
      const key = focusKey === undefined ? activeKey() : focusKey;
      render();
      restoreFocus(key);
    }

    // ---------------------------------------------------------------- small builders
    function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
      const id = control.id || uid('f');
      control.id = id;
      return h('div', { class: 'ed-field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'ed-hint' }, hint) : null);
    }

    function btn(label: string, onclick: () => void, opts: { aria?: string; fk?: string; disabled?: boolean; cls?: string } = {}): HTMLButtonElement {
      return h(
        'button',
        {
          type: 'button',
          class: `ed-btn ${opts.cls ?? ''}`.trim(),
          'aria-label': opts.aria,
          'data-fk': opts.fk,
          disabled: opts.disabled,
          onclick,
        },
        label,
      );
    }

    // ---------------------------------------------------------------- questions
    function questionCard(key: ListKey, i: number): HTMLElement {
      const list = game[key];
      const q = list[i];
      const isMain = key === 'questions';
      const noun = isMain ? 'question' : 'spare';
      const label = `${isMain ? 'Question' : 'Spare'} ${i + 1}`;
      const fk = (s: string): string => `${key}:${q.id}:${s}`;
      const open = expanded.has(q.id);
      const bodyId = `body-${q.id}`;

      const titleEl = h('span', { class: 'ed-card-title' });
      const prizeEl = h('span', { class: 'ed-card-prize' });
      const badge = h('span', { class: 'ed-badge', hidden: true }, 'Needs attention');
      const issuesEl = h('ul', { class: 'ed-issues', 'aria-live': 'off' });

      const updateHead = (): void => {
        const snippet = q.text.trim() ? (q.text.trim().length > 60 ? `${q.text.trim().slice(0, 57)}...` : q.text.trim()) : '(no text yet)';
        titleEl.textContent = `${label}: ${snippet}`;
        prizeEl.textContent = isMain && game.ladder.prizes[i] !== undefined ? money(game.ladder.prizes[i], game.ladder.currency) : '';
        const issues = questionIssues(q);
        badge.hidden = issues.length === 0;
        clear(issuesEl);
        issues.forEach((s) => issuesEl.appendChild(h('li', null, s)));
        issuesEl.hidden = issues.length === 0;
      };
      updaters.push(updateHead);

      const textArea = h('textarea', {
        rows: 3,
        id: `${q.id}-text`,
        'aria-invalid': 'false',
        oninput: () => {
          q.text = (textArea as HTMLTextAreaElement).value;
          refresh();
        },
      }) as HTMLTextAreaElement;
      textArea.value = q.text;

      const answerRows = q.answers.map((a, ai) => {
        const inp = h('input', {
          type: 'text',
          id: `${q.id}-a${ai}`,
          'aria-label': `${label} answer ${LETTERS[ai]} text`,
          oninput: () => {
            q.answers[ai] = (inp as HTMLInputElement).value;
            refresh();
          },
        }) as HTMLInputElement;
        inp.value = a;
        return h(
          'div',
          { class: 'ed-answer' },
          h('span', { class: 'ed-letter', 'aria-hidden': 'true' }, LETTERS[ai]),
          inp,
          h(
            'label',
            { class: 'ed-correct' },
            h('input', {
              type: 'radio',
              name: `correct-${q.id}`,
              value: String(ai),
              checked: q.correct === ai,
              'aria-label': `${label}: mark answer ${LETTERS[ai]} as correct`,
              onchange: () => {
                q.correct = ai as AnswerIndex;
              },
            }),
            ' Correct',
          ),
        );
      });

      const diffSel = h(
        'select',
        {
          onchange: () => {
            q.difficulty = Number((diffSel as HTMLSelectElement).value) as Difficulty;
          },
        },
        [1, 2, 3, 4, 5].map((d) => h('option', { value: d, selected: q.difficulty === d }, `${d}${d === 1 ? ' (easiest)' : d === 5 ? ' (hardest)' : ''}`)),
      );
      const catInp = h('input', {
        type: 'text',
        oninput: () => {
          const v = (catInp as HTMLInputElement).value;
          if (v.trim()) q.category = v;
          else delete q.category;
        },
      }) as HTMLInputElement;
      catInp.value = q.category ?? '';
      const expl = h('textarea', {
        rows: 2,
        oninput: () => {
          const v = (expl as HTMLTextAreaElement).value;
          if (v.trim()) q.explanation = v;
          else delete q.explanation;
        },
      }) as HTMLTextAreaElement;
      expl.value = q.explanation ?? '';

      const toggle = h(
        'button',
        {
          type: 'button',
          class: 'ed-toggle',
          'aria-expanded': String(open),
          'aria-controls': bodyId,
          'data-fk': fk('toggle'),
          onclick: () => {
            if (expanded.has(q.id)) expanded.delete(q.id);
            else expanded.add(q.id);
            rerender(fk('toggle'));
          },
        },
        h('span', { class: 'ed-chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
        titleEl,
        prizeEl,
        badge,
      );

      const atMin = isMain && game.questions.length <= 1;
      const tools = h(
        'div',
        { class: 'ed-tools', role: 'group', 'aria-label': `${label} actions` },
        btn('Up', () => {
          move(list, i, -1);
          ctx.announce(`${label} moved up to position ${i}.`);
          rerender(fk('up'));
        }, { aria: `Move ${label} up`, fk: fk('up'), disabled: i === 0 }),
        btn('Down', () => {
          move(list, i, 1);
          ctx.announce(`${label} moved down to position ${i + 2}.`);
          rerender(fk('down'));
        }, { aria: `Move ${label} down`, fk: fk('down'), disabled: i === list.length - 1 }),
        btn('Copy', () => {
          if (isMain && game.ladder.prizes.length >= MAX_RUNGS) return;
          const copy = clone(q);
          copy.id = uid(isMain ? 'q' : 'sp');
          list.splice(i + 1, 0, copy);
          if (isMain) {
            appendRung();
            markCustomLadder();
            syncRungs();
          }
          expanded.add(copy.id);
          ctx.announce(`${label} duplicated.`);
          rerender(`${key}:${copy.id}:toggle`);
        }, { aria: `Duplicate ${label}`, fk: fk('dup'), disabled: isMain && game.ladder.prizes.length >= MAX_RUNGS }),
        btn('Remove', () => {
          list.splice(i, 1);
          expanded.delete(q.id);
          if (isMain) {
            game.ladder.prizes.pop();
            markCustomLadder();
            syncRungs();
          }
          ctx.announce(`${label} removed.`);
          rerender(`${key}-add`);
        }, { aria: `Remove ${label}`, fk: fk('del'), disabled: atMin, cls: 'ed-btn-danger' }),
      );

      const body = h(
        'div',
        { class: 'ed-card-body', id: bodyId, hidden: !open },
        field(`${isMain ? 'Question' : 'Spare'} text`, textArea),
        h('fieldset', { class: 'ed-answers' }, h('legend', null, 'Answers (select the correct one)'), answerRows),
        h(
          'div',
          { class: 'ed-row' },
          field('Difficulty', diffSel as HTMLElement),
          field('Category (optional)', catInp),
        ),
        field('Explanation (optional)', expl),
        issuesEl,
      );
      void noun;
      updateHead();
      return h('li', { class: 'ed-card' }, h('div', { class: 'ed-card-head' }, toggle, tools), body);
    }

    function questionList(key: ListKey): HTMLElement {
      const list = game[key];
      const isMain = key === 'questions';
      const addDisabled = isMain && game.ladder.prizes.length >= MAX_RUNGS;
      return h(
        'section',
        { class: 'ed-section', 'aria-labelledby': `${key}-h` },
        h('h2', { id: `${key}-h` }, isMain ? `Questions (${list.length})` : `Spare questions (${list.length})`),
        h(
          'p',
          { class: 'ed-hint' },
          isMain
            ? 'One question per ladder rung, in play order. Adding a question adds a rung; removing one removes the top rung.'
            : 'Spares are used by the Switch lifeline. Add at least a few of varied difficulty.',
        ),
        list.length ? h('ol', { class: 'ed-list' }, list.map((_, i) => questionCard(key, i))) : h('p', { class: 'ed-empty' }, 'None yet.'),
        h(
          'div',
          { class: 'ed-actions' },
          btn(isMain ? 'Add question' : 'Add spare', () => {
            if (isMain) {
              const q = addQuestion();
              if (q) ctx.announce(`Question ${game.questions.length} added.`);
              rerender(q ? `questions:${q.id}:toggle` : null);
            } else {
              const q = blankQuestion('sp', 3);
              game.spares.push(q);
              expanded.add(q.id);
              ctx.announce(`Spare ${game.spares.length} added.`);
              rerender(`spares:${q.id}:toggle`);
            }
          }, { fk: `${key}-add`, disabled: addDisabled, cls: 'ed-btn-primary' }),
        ),
      );
    }

    // ---------------------------------------------------------------- ladder
    function ladderSection(): HTMLElement {
      const l = game.ladder;
      const presetValue = LADDER_PRESETS.some((p) => p.id === l.id) ? l.id : 'custom';
      const presetOptions = [...LADDER_PRESETS, ...(LADDER_PRESETS.some((p) => p.id === 'classic') ? [] : [{ id: 'classic', name: 'Classic' } as LadderConfig])];
      const presetSel = h(
        'select',
        {
          id: 'ladder-preset',
          onchange: () => {
            applyPreset((presetSel as HTMLSelectElement).value);
            rerender('ladder-preset');
          },
        },
        presetOptions.map((p) => h('option', { value: p.id, selected: p.id === presetValue }, p.name)),
        h('option', { value: 'custom', selected: presetValue === 'custom' }, 'Custom'),
      );
      const nameInp = h('input', {
        type: 'text',
        oninput: () => {
          l.name = (nameInp as HTMLInputElement).value;
        },
      }) as HTMLInputElement;
      nameInp.value = l.name;
      const curSel = h(
        'select',
        {
          onchange: () => {
            l.currency = (curSel as HTMLSelectElement).value as Currency;
            refresh();
          },
        },
        CURRENCIES.map((c) => h('option', { value: c, selected: l.currency === c }, c === 'pts' ? 'Points' : c)),
      );
      const topInp = h('input', {
        type: 'text',
        oninput: () => {
          const v = (topInp as HTMLInputElement).value;
          if (v.trim()) l.topPrizeLabel = v;
          else delete l.topPrizeLabel;
        },
      }) as HTMLInputElement;
      topInp.value = l.topPrizeLabel ?? '';

      const rows = l.prizes.map((prize, i) => {
        const pid = `prize-${i}`;
        const inp = h('input', {
          type: 'number',
          id: pid,
          min: 1,
          step: 1,
          inputmode: 'numeric',
          oninput: () => {
            const v = Number((inp as HTMLInputElement).value);
            l.prizes[i] = Number.isFinite(v) ? v : 0;
            markCustomLadder();
            refresh();
          },
        }) as HTMLInputElement;
        inp.value = String(prize);
        const hid = `haven-${i}`;
        return h(
          'li',
          { class: 'ed-rung' },
          h('label', { for: pid, class: 'ed-rung-label' }, `Rung ${i + 1}`),
          inp,
          h(
            'label',
            { class: 'ed-haven', for: hid },
            h('input', {
              type: 'checkbox',
              id: hid,
              checked: l.safeHavens.includes(i),
              onchange: () => {
                const on = (document.getElementById(hid) as HTMLInputElement).checked;
                l.safeHavens = on ? [...new Set([...l.safeHavens, i])].sort((a, b) => a - b) : l.safeHavens.filter((s) => s !== i);
                markCustomLadder();
                refresh();
              },
            }),
            ' Safe haven',
            h('span', { class: 'sr-only' }, ` at rung ${i + 1}`),
          ),
        );
      });

      return h(
        'section',
        { class: 'ed-section', 'aria-labelledby': 'ladder-h' },
        h('h2', { id: 'ladder-h' }, 'Prize ladder'),
        h('div', { class: 'ed-row' }, field('Preset', presetSel as HTMLElement), field('Ladder name', nameInp), field('Currency', curSel as HTMLElement), field('Top prize label (optional)', topInp)),
        h('ol', { class: 'ed-rungs' }, rows),
        h(
          'div',
          { class: 'ed-actions' },
          btn('Add rung', () => {
            const q = addQuestion();
            if (q) ctx.announce(`Rung ${game.ladder.prizes.length} added with a new question.`);
            rerender('ladder-add');
          }, { fk: 'ladder-add', disabled: l.prizes.length >= MAX_RUNGS }),
          btn('Remove top rung', () => {
            const removed = game.questions[game.questions.length - 1];
            l.prizes.pop();
            markCustomLadder();
            syncRungs();
            if (removed) expanded.delete(removed.id);
            ctx.announce(`Top rung removed. ${game.questions.length} questions.`);
            rerender('ladder-remove');
          }, { fk: 'ladder-remove', disabled: l.prizes.length <= 1 }),
        ),
        h('p', { class: 'ed-hint' }, `The ladder has ${l.prizes.length} rungs, so the game has ${game.questions.length} questions.`),
      );
    }

    // ---------------------------------------------------------------- timer
    function timerSection(): HTMLElement {
      const t = game.timer;
      const modeSel = h(
        'select',
        {
          id: 'timer-mode',
          onchange: () => {
            const m = (modeSel as HTMLSelectElement).value;
            if (m === 'off') game.timer = { mode: 'off' };
            else
              game.timer = {
                mode: 'clock',
                secondsPerQuestion: game.ladder.prizes.map((_, i) => clockSeconds(i)),
                bankUnusedToLast: true,
                onTimeout: 'walk',
              } as TimerConfig;
            rerender('timer-mode');
          },
        },
        h('option', { value: 'off', selected: t.mode === 'off' }, 'Off (no clock)'),
        h('option', { value: 'clock', selected: t.mode === 'clock' }, 'Clock (time limit per question)'),
      );
      const kids: unknown[] = [h('h2', { id: 'timer-h' }, 'Timer'), field('Mode', modeSel as HTMLElement)];
      if (t.mode === 'clock') {
        const clockT = t;
        const onSel = h(
          'select',
          {
            onchange: () => {
              clockT.onTimeout = (onSel as HTMLSelectElement).value as 'walk' | 'lose';
            },
          },
          h('option', { value: 'walk', selected: clockT.onTimeout === 'walk' }, 'Walk away with current winnings'),
          h('option', { value: 'lose', selected: clockT.onTimeout === 'lose' }, 'Lose down to the last safe haven'),
        );
        kids.push(
          field('When time runs out', onSel as HTMLElement),
          h(
            'label',
            { class: 'ed-check' },
            h('input', {
              type: 'checkbox',
              checked: clockT.bankUnusedToLast,
              onchange: (e: Event) => {
                clockT.bankUnusedToLast = (e.target as HTMLInputElement).checked;
              },
            }),
            ' Bank unused time for the last question',
          ),
          h(
            'fieldset',
            { class: 'ed-secs' },
            h('legend', null, 'Seconds per question'),
            clockT.secondsPerQuestion.map((s, i) => {
              const inp = h('input', {
                type: 'number',
                min: 5,
                max: 600,
                step: 1,
                id: `secs-${i}`,
                oninput: () => {
                  const v = Number((inp as HTMLInputElement).value);
                  clockT.secondsPerQuestion[i] = Number.isFinite(v) && v > 0 ? v : 5;
                },
              }) as HTMLInputElement;
              inp.value = String(s);
              return h('div', { class: 'ed-sec' }, h('label', { for: `secs-${i}` }, `Q${i + 1}`), inp);
            }),
          ),
        );
      }
      return h('section', { class: 'ed-section', 'aria-labelledby': 'timer-h' }, ...(kids as Node[]));
    }

    // ---------------------------------------------------------------- lifelines
    function lifelineSection(): HTMLElement {
      const all = [...builtIns(), ...customLifelines.filter((c) => !builtIns().some((b) => b.id === c.id))];
      const rows = all.map((ll) => {
        const cid = `ll-${ll.id}`;
        const isCustom = !ll.builtIn;
        return h(
          'li',
          { class: 'ed-ll' },
          h(
            'label',
            { class: 'ed-check', for: cid },
            h('input', {
              type: 'checkbox',
              id: cid,
              checked: game.lifelineIds.includes(ll.id),
              onchange: () => {
                const on = (document.getElementById(cid) as HTMLInputElement).checked;
                game.lifelineIds = on ? [...new Set([...game.lifelineIds, ll.id])] : game.lifelineIds.filter((x) => x !== ll.id);
                refresh();
              },
            }),
            ' ',
            ll.icon === ll.name ? null : h('span', { 'aria-hidden': 'true' }, ll.icon),
            ' ',
            h('strong', null, ll.name),
            h('small', { class: 'ed-hint' }, ` ${EFFECT_LABELS[ll.effect] ?? ll.effect}${isCustom ? ' (custom)' : ''}`),
          ),
          isCustom
            ? h(
                'span',
                { class: 'ed-tools' },
                btn('Edit', () => {
                  lifelineForm = { initial: ll };
                  rerender('lifeline-form');
                }, { aria: `Edit lifeline ${ll.name}`, fk: `ll-edit-${ll.id}` }),
                pendingDelete === ll.id
                  ? btn('Confirm delete', () => {
                      deleteLifeline(ll.id);
                      game.lifelineIds = game.lifelineIds.filter((x) => x !== ll.id);
                      customLifelines = listCustomLifelines();
                      pendingDelete = null;
                      ctx.announce(`Lifeline ${ll.name} deleted.`);
                      rerender('lifeline-new');
                    }, { aria: `Confirm deleting lifeline ${ll.name}`, fk: `ll-del-${ll.id}`, cls: 'ed-btn-danger' })
                  : btn('Delete', () => {
                      pendingDelete = ll.id;
                      rerender(`ll-del-${ll.id}`);
                    }, { aria: `Delete lifeline ${ll.name}`, fk: `ll-del-${ll.id}`, cls: 'ed-btn-danger' }),
              )
            : null,
        );
      });

      let formEl: HTMLElement | null = null;
      if (lifelineForm) {
        formEl = lifelineEditor({
          initial: lifelineForm.initial,
          onSave: (def) => {
            upsertLifeline(def);
            customLifelines = listCustomLifelines();
            if (!customLifelines.some((c) => c.id === def.id)) customLifelines = [...customLifelines, def];
            if (!lifelineForm?.initial && !game.lifelineIds.includes(def.id)) game.lifelineIds.push(def.id);
            lifelineForm = null;
            ctx.announce(`Lifeline ${def.name} saved.`);
            rerender('lifeline-new');
          },
          onCancel: () => {
            lifelineForm = null;
            rerender('lifeline-new');
          },
        });
        formEl.id = 'lifeline-form';
        formEl.tabIndex = -1;
      }

      return h(
        'section',
        { class: 'ed-section', 'aria-labelledby': 'lifelines-h' },
        h('h2', { id: 'lifelines-h' }, 'Lifelines'),
        h('p', { class: 'ed-hint' }, 'Choose which lifelines players get in this game, or build your own.'),
        h('ul', { class: 'ed-list ed-plain' }, rows),
        formEl,
        lifelineForm ? null : btn('New custom lifeline', () => {
          lifelineForm = {};
          rerender('lifeline-form');
          (document.getElementById('lifeline-form')?.querySelector('input') as HTMLElement | null)?.focus();
        }, { fk: 'lifeline-new', cls: 'ed-btn-primary' }),
      );
    }

    // ---------------------------------------------------------------- actions
    function trySave(): boolean {
      const { errors } = validation();
      if (errors.length) {
        statusMsg = '';
        renderValidation();
        valBox.tabIndex = -1;
        valBox.focus();
        ctx.announce(`Cannot save: ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix.`, true);
        return false;
      }
      game.name = game.name.trim();
      game.updatedAt = new Date().toISOString();
      try {
        upsertCustomGame(clone(game));
      } catch (e) {
        statusMsg = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
        renderValidation();
        ctx.announce(statusMsg, true);
        return false;
      }
      statusMsg = `Saved "${game.name}".`;
      renderValidation();
      ctx.announce(statusMsg);
      return true;
    }

    function doExport(): void {
      if (!trySave()) return;
      try {
        const text = exportJSON([game.id]);
        const fname = `${game.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'custom-game'}.json`;
        if (!download(fname, text)) throw new Error('Downloads are not supported in this browser.');
        statusMsg = `Saved and exported "${game.name}" as ${fname}.`;
      } catch (e) {
        statusMsg = `Export failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      renderValidation();
      ctx.announce(statusMsg);
    }

    async function doImport(file: File): Promise<void> {
      try {
        const text = await file.text();
        const res = importJSON(text);
        customLifelines = listCustomLifelines();
        statusMsg = `Imported ${res.imported} game${res.imported === 1 ? '' : 's'}.${res.errors.length ? ` Problems: ${res.errors.join('; ')}` : ''} Find imported games in the menu.`;
      } catch (e) {
        statusMsg = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (disposed) return;
      rerender(null);
      ctx.announce(statusMsg);
    }

    // ---------------------------------------------------------------- render
    function render(): void {
      updaters = [];
      clear(el);
      const nameInp = h('input', {
        type: 'text',
        id: 'game-name',
        maxlength: 60,
        required: true,
        autocomplete: 'off',
        oninput: () => {
          game.name = (nameInp as HTMLInputElement).value;
          refresh();
        },
      }) as HTMLInputElement;
      nameInp.value = game.name;
      const fileInp = h('input', {
        type: 'file',
        accept: 'application/json,.json',
        class: 'sr-only',
        id: 'import-file',
        tabindex: -1,
        onchange: () => {
          const f = (fileInp as HTMLInputElement).files?.[0];
          if (f) void doImport(f);
          (fileInp as HTMLInputElement).value = '';
        },
      });
      valBox = h('div', { class: 'ed-ok', id: 'ed-validation' });

      el.append(
        h(
          'header',
          { class: 'ed-header' },
          btn('Back to menu', () => ctx.navigate('menu'), { fk: 'back' }),
          h('h1', null, isNew ? 'New custom game' : 'Edit custom game'),
        ),
        h('section', { class: 'ed-section', 'aria-labelledby': 'details-h' }, h('h2', { id: 'details-h' }, 'Details'), field('Game name', nameInp)),
        ladderSection(),
        questionList('questions'),
        questionList('spares'),
        timerSection(),
        lifelineSection(),
        valBox,
        h(
          'div',
          { class: 'ed-actions ed-footer' },
          btn('Save', () => void trySave(), { fk: 'save', cls: 'ed-btn-primary' }),
          btn('Save & Play', () => {
            if (trySave()) ctx.navigate('setup', { customGameId: game.id });
          }, { fk: 'save-play', cls: 'ed-btn-primary' }),
          btn('Export', doExport, { fk: 'export' }),
          btn('Import', () => (fileInp as HTMLInputElement).click(), { fk: 'import' }),
          fileInp,
        ),
      );
      updaters.forEach((u) => u());
      renderValidation();
    }

    render();
    return () => {
      disposed = true;
      el.remove();
    };
  },
};
