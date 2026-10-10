// WP8: custom lifeline builder form.
import type { EffectType, LifelineDef, LifelineParams } from '../../core/types';
import { validateLifeline } from '../../core/lifelines';
import { h, clear } from '../dom';

export interface LifelineEditorProps {
  initial?: LifelineDef;
  onSave: (def: LifelineDef) => void;
  onCancel: () => void;
}

export const LIFELINE_ICONS = [
  '✂️', // scissors
  '\u{1F4DE}', // telephone
  '\u{1F465}', // people
  '\u{1F501}', // repeat
  '\u{1F6E1}️', // shield
  '⏱️', // stopwatch
  '\u{1F4A1}', // bulb
  '⭐', // star
  '\u{1F3B2}', // dice
  '\u{1F9E0}', // brain
  '\u{1F52E}', // crystal ball
  '\u{1F3AF}', // target
];

export const EFFECT_LABELS: Record<EffectType, string> = {
  'remove-wrong': 'Remove wrong answers (like 50:50)',
  'friend-hint': 'Phone a friend (hint)',
  'audience-poll': 'Ask the audience (poll)',
  'skip-question': 'Switch the question',
  'second-chance': 'Second chance (Double Dip)',
  'extra-time': 'Extra time (clock mode)',
  'host-hint': 'Host hint',
};

const EFFECTS = Object.keys(EFFECT_LABELS) as EffectType[];

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${counter}${rand}`;
}

/** Which param fields each effect uses. */
export function paramFieldsFor(effect: EffectType): (keyof LifelineParams)[] {
  switch (effect) {
    case 'remove-wrong':
      return ['n'];
    case 'friend-hint':
    case 'audience-poll':
    case 'host-hint':
      return ['accuracy'];
    case 'extra-time':
      return ['seconds'];
    default:
      return [];
  }
}

function defaultParams(effect: EffectType): LifelineParams {
  switch (effect) {
    case 'remove-wrong':
      return { n: 2 };
    case 'friend-hint':
    case 'audience-poll':
    case 'host-hint':
      return { accuracy: 0.8 };
    case 'extra-time':
      return { seconds: 30 };
    default:
      return {};
  }
}

/** Local validation (always runs, in addition to core validateLifeline). */
export function localLifelineErrors(def: LifelineDef): string[] {
  const errs: string[] = [];
  if (!def.name.trim()) errs.push('Name is required.');
  else if (def.name.trim().length > 24) errs.push('Name must be 24 characters or fewer.');
  if (!def.icon) errs.push('Choose an icon.');
  if (!EFFECTS.includes(def.effect)) errs.push('Choose an effect.');
  if (!Number.isInteger(def.uses) || def.uses < 1 || def.uses > 10)
    errs.push('Uses per game must be a whole number from 1 to 10.');
  if (def.availableFromQ !== undefined && (!Number.isInteger(def.availableFromQ) || def.availableFromQ < 0))
    errs.push('"Available from question" must be 1 or more.');
  const p = def.params;
  if (def.effect === 'remove-wrong' && !(p.n === 1 || p.n === 2))
    errs.push('Wrong answers to remove must be 1 or 2.');
  if (
    (def.effect === 'friend-hint' || def.effect === 'audience-poll' || def.effect === 'host-hint') &&
    (typeof p.accuracy !== 'number' || !(p.accuracy >= 0 && p.accuracy <= 1))
  )
    errs.push('Accuracy must be between 0 and 1.');
  if (
    def.effect === 'extra-time' &&
    (typeof p.seconds !== 'number' || !(p.seconds >= 5 && p.seconds <= 120))
  )
    errs.push('Seconds must be between 5 and 120.');
  return errs;
}

export function lifelineErrors(def: LifelineDef): string[] {
  let core: string[] = [];
  try {
    core = validateLifeline(def) ?? [];
  } catch {
    core = [];
  }
  return Array.from(new Set([...localLifelineErrors(def), ...core]));
}

export function lifelineEditor(props: LifelineEditorProps): HTMLElement {
  const init = props.initial;
  const id = init?.id ?? uid('custom');
  const formId = `ll-${id}`;
  let name = init?.name ?? '';
  let icon = init?.icon ?? LIFELINE_ICONS[0];
  let effect: EffectType = init?.effect ?? 'remove-wrong';
  let params: LifelineParams = { ...(init ? init.params : defaultParams(effect)) };
  let uses = init?.uses ?? 1;
  let availableFrom = (init?.availableFromQ ?? 0) + 1;

  const errorBox = h('div', {
    class: 'ed-errors',
    role: 'alert',
    id: `${formId}-errors`,
    hidden: true,
  });
  const paramsBox = h('div', { class: 'ed-params' });

  function numField(
    label: string,
    value: number | undefined,
    attrs: Record<string, unknown>,
    onChange: (v: number | undefined) => void,
    hint?: string,
  ): HTMLElement {
    const inputId = `${formId}-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const input = h('input', {
      type: 'number',
      id: inputId,
      value: value === undefined ? '' : String(value),
      ...attrs,
      oninput: () => {
        const raw = (input as HTMLInputElement).value;
        onChange(raw === '' ? undefined : Number(raw));
      },
    });
    return h(
      'div',
      { class: 'ed-field' },
      h('label', { for: inputId }, label),
      input,
      hint ? h('small', { class: 'ed-hint' }, hint) : null,
    );
  }

  function renderParams(): void {
    clear(paramsBox);
    const fields = paramFieldsFor(effect);
    if (fields.length === 0) {
      paramsBox.appendChild(h('p', { class: 'ed-hint' }, 'This effect has no extra settings.'));
      return;
    }
    if (fields.includes('n'))
      paramsBox.appendChild(
        numField('Wrong answers to remove', params.n, { min: 1, max: 2, step: 1 }, (v) => {
          params.n = v;
        }, '1 or 2'),
      );
    if (fields.includes('accuracy'))
      paramsBox.appendChild(
        numField('Accuracy', params.accuracy, { min: 0, max: 1, step: 0.05 }, (v) => {
          params.accuracy = v;
        }, '0 (useless) to 1 (always right)'),
      );
    if (fields.includes('seconds'))
      paramsBox.appendChild(
        numField('Seconds to add', params.seconds, { min: 5, max: 120, step: 1 }, (v) => {
          params.seconds = v;
        }, '5 to 120. Only has an effect in clock mode.'),
      );
  }

  const effectSelect = h(
    'select',
    {
      id: `${formId}-effect`,
      onchange: () => {
        effect = (effectSelect as HTMLSelectElement).value as EffectType;
        params = defaultParams(effect);
        renderParams();
      },
    },
    EFFECTS.map((e) => h('option', { value: e, selected: e === effect }, EFFECT_LABELS[e])),
  );

  const iconGroup = h(
    'div',
    { class: 'ed-icons', role: 'radiogroup', 'aria-label': 'Icon' },
    LIFELINE_ICONS.map((ic, i) => {
      const rid = `${formId}-icon-${i}`;
      return h(
        'span',
        { class: 'ed-icon-opt' },
        h('input', {
          type: 'radio',
          name: `${formId}-icon`,
          id: rid,
          value: ic,
          checked: ic === icon,
          onchange: () => {
            icon = ic;
          },
        }),
        h('label', { for: rid, title: `Icon ${i + 1}` }, h('span', { 'aria-hidden': 'true' }, ic), h('span', { class: 'sr-only' }, `Icon ${i + 1}`)),
      );
    }),
  );
  // An existing custom icon not in the palette stays selectable.
  if (init && !LIFELINE_ICONS.includes(init.icon)) {
    const rid = `${formId}-icon-current`;
    iconGroup.appendChild(
      h(
        'span',
        { class: 'ed-icon-opt' },
        h('input', { type: 'radio', name: `${formId}-icon`, id: rid, value: init.icon, checked: true, onchange: () => { icon = init.icon; } }),
        h('label', { for: rid }, h('span', { 'aria-hidden': 'true' }, init.icon), h('span', { class: 'sr-only' }, 'Current icon')),
      ),
    );
  }

  const nameInput = h('input', {
    type: 'text',
    id: `${formId}-name`,
    maxlength: 24,
    required: true,
    value: name,
    autocomplete: 'off',
    oninput: () => {
      name = (nameInput as HTMLInputElement).value;
    },
  });

  function build(): LifelineDef {
    const def: LifelineDef = {
      id,
      name: name.trim(),
      icon,
      effect,
      params: {},
      uses,
      builtIn: false,
    };
    for (const k of paramFieldsFor(effect)) {
      const v = params[k];
      if (v !== undefined) def.params[k] = v;
    }
    if (availableFrom > 1) def.availableFromQ = availableFrom - 1;
    return def;
  }

  function showErrors(errs: string[]): void {
    clear(errorBox);
    if (errs.length === 0) {
      errorBox.hidden = true;
      return;
    }
    errorBox.hidden = false;
    errorBox.appendChild(h('strong', null, 'Please fix:'));
    errorBox.appendChild(h('ul', null, errs.map((e) => h('li', null, e))));
  }

  const form = h(
    'form',
    {
      class: 'ed-lifeline-form',
      novalidate: true,
      'aria-label': init ? `Edit lifeline ${init.name}` : 'New custom lifeline',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        const def = build();
        const errs = lifelineErrors(def);
        showErrors(errs);
        if (errs.length === 0) props.onSave(def);
        else (nameInput as HTMLInputElement).focus();
      },
    },
    h('h3', null, init ? 'Edit custom lifeline' : 'New custom lifeline'),
    h('div', { class: 'ed-field' }, h('label', { for: `${formId}-name` }, 'Name'), nameInput),
    h('div', { class: 'ed-field' }, h('span', { class: 'ed-label', id: `${formId}-icon-label` }, 'Icon'), iconGroup),
    h('div', { class: 'ed-field' }, h('label', { for: `${formId}-effect` }, 'Effect'), effectSelect),
    paramsBox,
    numField('Uses per game', uses, { min: 1, max: 10, step: 1 }, (v) => {
      uses = v ?? NaN;
    }),
    numField(
      'Available from question',
      availableFrom,
      { min: 1, step: 1 },
      (v) => {
        availableFrom = v ?? 1;
      },
      'Question number (1 = from the start)',
    ),
    errorBox,
    h(
      'div',
      { class: 'ed-actions' },
      h('button', { type: 'submit', class: 'ed-btn ed-btn-primary' }, 'Save lifeline'),
      h('button', { type: 'button', class: 'ed-btn', onclick: () => props.onCancel() }, 'Cancel'),
    ),
  );
  renderParams();
  return form;
}
