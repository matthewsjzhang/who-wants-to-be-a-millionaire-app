import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/lifelines', () => ({
  validateLifeline: () => {
    throw new Error('TODO');
  },
  BUILT_IN_LIFELINES: [],
  applyEffect: () => ({}),
}));

import { localLifelineErrors, lifelineEditor, paramFieldsFor } from '../../../src/ui/components/lifelineEditor';
import type { LifelineDef } from '../../../src/core/types';

const base: LifelineDef = { id: 'c1', name: 'Boost', icon: 'x', effect: 'extra-time', params: { seconds: 30 }, uses: 1, builtIn: false };

describe('lifeline validation', () => {
  it('accepts a valid definition', () => {
    expect(localLifelineErrors(base)).toEqual([]);
  });
  it('rejects out-of-range params', () => {
    expect(localLifelineErrors({ ...base, params: { seconds: 500 } }).length).toBe(1);
    expect(localLifelineErrors({ ...base, effect: 'remove-wrong', params: { n: 3 } }).length).toBe(1);
    expect(localLifelineErrors({ ...base, effect: 'audience-poll', params: { accuracy: 1.5 } }).length).toBe(1);
  });
  it('maps params per effect', () => {
    expect(paramFieldsFor('remove-wrong')).toEqual(['n']);
    expect(paramFieldsFor('skip-question')).toEqual([]);
  });
});

describe('lifelineEditor form', () => {
  it('survives a throwing core validator and saves edits', () => {
    const onSave = vi.fn();
    const form = lifelineEditor({ initial: base, onSave, onCancel: () => undefined });
    document.body.appendChild(form);
    const secs = form.querySelector<HTMLInputElement>('input[type="number"]')!;
    secs.value = '45';
    secs.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].params.seconds).toBe(45);
    expect(onSave.mock.calls[0][0].id).toBe('c1');
  });
  it('shows errors and does not save an empty name', () => {
    const onSave = vi.fn();
    const form = lifelineEditor({ onSave, onCancel: () => undefined });
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSave).not.toHaveBeenCalled();
    expect(form.querySelector('[role="alert"]')!.textContent).toContain('Name is required');
  });
});
