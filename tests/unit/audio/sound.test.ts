/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { createSound } from '../../../src/audio/sound';

function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function makeMock() {
  const state = { instances: 0, oscillators: [] as any[], gains: [] as any[], resume: vi.fn(() => Promise.resolve()) };
  class MockCtx {
    currentTime = 0;
    state = 'suspended';
    destination = {};
    constructor() {
      state.instances++;
    }
    resume = state.resume;
    createGain() {
      const g = { gain: param(), connect: vi.fn() };
      state.gains.push(g);
      return g;
    }
    createOscillator() {
      const o = { type: 'sine', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      state.oscillators.push(o);
      return o;
    }
  }
  return { state, Ctor: MockCtx as any };
}

describe('sound', () => {
  it('is lazy: no AudioContext until unlock/play', () => {
    const { state, Ctor } = makeMock();
    const s = createSound(() => Ctor);
    s.setVolume(0.5);
    s.setMuted(false);
    expect(state.instances).toBe(0);
    s.unlock();
    s.unlock();
    expect(state.instances).toBe(1);
    expect(state.resume).toHaveBeenCalled();
  });

  it('plays every cue without throwing and creates oscillators', () => {
    const { state, Ctor } = makeMock();
    const s = createSound(() => Ctor);
    s.unlock();
    for (const c of ['select', 'final', 'correct', 'wrong', 'lifeline', 'milestone', 'tick', 'win'] as const) {
      const before = state.oscillators.length;
      expect(() => s.play(c)).not.toThrow();
      expect(state.oscillators.length).toBeGreaterThan(before);
    }
  });

  it('correct is an ascending arpeggio, wrong descends', () => {
    const { state, Ctor } = makeMock();
    const s = createSound(() => Ctor);
    s.play('correct');
    const f = state.oscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0][0]);
    expect(f).toEqual([...f].sort((a, b) => a - b));
    const m2 = makeMock();
    const s2 = createSound(() => m2.Ctor);
    s2.play('wrong');
    const o = m2.state.oscillators[0];
    expect(o.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBeLessThan(
      o.frequency.setValueAtTime.mock.calls[0][0],
    );
  });

  it('bed-start starts a loop once; bed-stop stops it', () => {
    const { state, Ctor } = makeMock();
    const s = createSound(() => Ctor);
    s.play('bed-start');
    const n = state.oscillators.length;
    s.play('bed-start');
    expect(state.oscillators.length).toBe(n);
    expect(state.oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    s.play('bed-stop');
    expect(state.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    s.play('bed-stop');
    expect(state.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    s.play('bed-start');
    expect(state.oscillators.length).toBeGreaterThan(n);
  });

  it('mute and volume drive master gain', () => {
    const { state, Ctor } = makeMock();
    const s = createSound(() => Ctor);
    s.unlock();
    const master = state.gains[0];
    const last = () => master.gain.setValueAtTime.mock.calls.at(-1)![0];
    s.setVolume(1);
    expect(last()).toBeGreaterThan(0);
    s.setMuted(true);
    expect(last()).toBe(0);
    s.setMuted(false);
    s.setVolume(5);
    const maxLevel = last();
    s.setVolume(0.5);
    expect(last()).toBeCloseTo(maxLevel / 2);
    s.setVolume(-3);
    expect(last()).toBe(0);
  });

  it('is a silent no-op when AudioContext is unsupported or throws', () => {
    const s = createSound(() => undefined);
    expect(() => {
      s.unlock();
      s.play('correct');
      s.play('bed-start');
      s.play('bed-stop');
      s.setMuted(true);
      s.setVolume(0.3);
    }).not.toThrow();
    const t = createSound(() => {
      throw new Error('nope');
    });
    expect(() => {
      t.unlock();
      t.play('win');
    }).not.toThrow();
  });
});
