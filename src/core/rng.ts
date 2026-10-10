// WP1: seeded PRNG (mulberry32) with serialisable state.
export interface Rng {
  next(): number;
  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number;
  /** Returns a shuffled copy (Fisher-Yates); input is not mutated. */
  shuffle<T>(a: T[]): T[];
  /** Serialisable position (for save/resume). */
  getState(): number;
}

/**
 * Create a deterministic RNG. If `state` is given it overrides the seed so a
 * saved game can continue exactly where it left off.
 */
export function createRng(seed: number, state?: number): Rng {
  let a = (state ?? seed) | 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    shuffle<T>(arr: T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    getState(): number {
      return a >>> 0;
    },
  };
}
