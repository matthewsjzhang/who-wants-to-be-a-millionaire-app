// WP2: audience poll and phone-a-friend simulation. Pure functions, seeded via Rng.
import type { Hint, Question } from './types';
import type { Rng } from './rng';

const LETTERS = ['A', 'B', 'C', 'D'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Uniform integer in [0, n) using only rng.next(). */
function pick(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng.next() * n));
}

/** Baseline chance a crowd picks the right answer: 0.85 at difficulty 1 down to 0.40 at 5. */
export function baseAccuracy(difficulty: number): number {
  const d = clamp(Math.round(difficulty), 1, 5);
  return 0.85 - (d - 1) * 0.1125;
}

function remainingIndices(eliminated: number[]): number[] {
  return [0, 1, 2, 3].filter((i) => !eliminated.includes(i));
}

/** Convert weights to integers that sum exactly to 100 (largest remainder). */
function toPercentages(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  const raw = shares.map((s) => (total > 0 ? (s / total) * 100 : 0));
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .filter((o) => raw[o.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length) {
    floors[order[k].i] += 1;
    left -= 1;
  }
  return floors;
}

export function audiencePoll(
  q: Question,
  eliminated: number[],
  difficulty: number,
  rng: Rng,
  accuracy?: number,
): number[] {
  const remaining = remainingIndices(eliminated);
  const poll = [0, 0, 0, 0];
  if (remaining.length === 0) return [25, 25, 25, 25];
  if (remaining.length === 1) {
    poll[remaining[0]] = 100;
    return poll;
  }
  const base = accuracy ?? baseAccuracy(difficulty);
  const wrongs = remaining.filter((i) => i !== q.correct);
  const correctRemains = remaining.includes(q.correct);
  // Fewer wrong options left => the crowd is more likely to converge on the right one.
  const boost = (1 - base) * ((3 - wrongs.length) / 3) * 0.6;
  const noise = (rng.next() - 0.5) * 0.16;
  let pCorrect = clamp(base + boost + noise, 0.05, 0.97);
  if (!correctRemains) pCorrect = 0;
  else if (wrongs.length === 0) pCorrect = 1;
  const weights = [0, 0, 0, 0];
  if (correctRemains) weights[q.correct] = pCorrect;
  const wrongRaw = wrongs.map(() => 0.1 + rng.next() ** 2);
  const wrongSum = wrongRaw.reduce((a, b) => a + b, 0);
  wrongs.forEach((idx, k) => {
    weights[idx] = (1 - pCorrect) * (wrongRaw[k] / wrongSum);
  });
  return toPercentages(weights);
}

type Tier = 'high' | 'mid' | 'low' | 'none';

const FRIEND_TEMPLATES: Record<Tier, string[]> = {
  high: [
    "Oh, I know this one! It's {L}, {A}. I'd bet my house on it.",
    "That's easy, it's definitely {L}, {A}.",
    "I'm certain: {L}, {A}. I studied this once.",
  ],
  mid: [
    "Hmm, I'm fairly sure it's {L}, {A}. I'd go with that.",
    "I think it's {L}, {A}, but don't hold me to it.",
    'My gut says {L}, {A}. About seventy percent sure.',
  ],
  low: [
    "Ooh, tough one. If I had to guess, maybe {L}, {A}, but I'm not confident.",
    "I'm not sure at all... {L}, {A}? That's a coin flip for me.",
    "I half remember something about {A}. Could be {L}. Don't trust me too much!",
  ],
  none: [
    "Sorry, I really have no idea on this one. You're on your own.",
    "I've never heard of that in my life. I can't help you here.",
    'No clue whatsoever. I wish I could help!',
  ],
};

const HOST_TEMPLATES: Record<Tier, string[]> = {
  high: [
    "If I were you, I'd be looking very closely at {L}, {A}.",
    "I can't tell you, but {L}, {A}, wouldn't be a bad place to start.",
  ],
  mid: [
    "I'd say {L}, {A}, deserves some serious thought.",
    'Let\'s just say {L}, {A}, has been catching my eye.',
  ],
  low: [
    "Honestly, I'm not certain either, but {L}, {A}, might be worth a look.",
    "Hard to say. Perhaps {L}, {A}? Don't quote me.",
  ],
  none: ["I'm afraid I can't help you with this one.", "No hints from me this time, I'm afraid."],
};

function tierFor(confidence: number): Tier {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'mid';
  return 'low';
}

function makeHint(
  q: Question,
  eliminated: number[],
  difficulty: number,
  rng: Rng,
  accuracy: number | undefined,
  templates: Record<Tier, string[]>,
  baseBoost: number,
): Hint {
  const remaining = remainingIndices(eliminated);
  const base = clamp(accuracy ?? baseAccuracy(difficulty) + baseBoost, 0, 1);
  const d = clamp(Math.round(difficulty), 1, 5);
  // Chance the helper simply does not know (hard questions only, not with an accuracy override).
  const dunno = accuracy === undefined && d >= 4 ? (d - 3) * 0.06 : 0;
  if (remaining.length === 0 || rng.next() < dunno) {
    const t = templates.none;
    return { answer: null, confidence: 0.1, text: t[pick(rng, t.length)] };
  }
  const wrongs = remaining.filter((i) => i !== q.correct);
  const correctRemains = remaining.includes(q.correct);
  const isRight = correctRemains && (wrongs.length === 0 || rng.next() < base);
  const answer = isRight ? q.correct : wrongs[pick(rng, wrongs.length)];
  // Confidence is only loosely tied to correctness: friends can be confidently wrong.
  const confidence = clamp(base * 0.9 + (rng.next() - 0.5) * 0.3, 0.15, 0.97);
  const t = templates[tierFor(confidence)];
  const text = t[pick(rng, t.length)]
    .replace('{L}', LETTERS[answer])
    .replace('{A}', q.answers[answer]);
  return { answer, confidence: Math.round(confidence * 100) / 100, text };
}

export function friendHint(
  q: Question,
  eliminated: number[],
  difficulty: number,
  rng: Rng,
  accuracy?: number,
): Hint {
  return makeHint(q, eliminated, difficulty, rng, accuracy, FRIEND_TEMPLATES, 0.05);
}

/** Host nudge (host-hint effect): slightly more reliable than a friend, in the host's voice. */
export function hostHint(
  q: Question,
  eliminated: number[],
  difficulty: number,
  rng: Rng,
  accuracy?: number,
): Hint {
  return makeHint(q, eliminated, difficulty, rng, accuracy, HOST_TEMPLATES, 0.1);
}
