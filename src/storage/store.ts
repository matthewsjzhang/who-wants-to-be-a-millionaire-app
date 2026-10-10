// WP4: versioned localStorage wrapper. Never throws.
export const KEYS = {
  settings: 'mq:v1:settings',
  save: 'mq:v1:save',
  history: 'mq:v1:history',
  custom: 'mq:v1:custom',
  lifelines: 'mq:v1:lifelines',
  flagged: 'mq:v1:flagged',
} as const;

type Migrator = (raw: unknown) => unknown;
const migrators = new Map<string, Migrator>();

/** Migration hook: raw parsed value is passed through before validation (e.g. for future schema bumps). */
export function registerMigration(key: string, fn: Migrator): void {
  migrators.set(key, fn);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Read + parse + (optional) validate. Missing/corrupt/invalid data returns `fallback`
 * (corrupt entries are removed so they cannot keep failing).
 */
export function readJSON<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  const s = storage();
  if (!s) return fallback;
  let text: string | null;
  try {
    text = s.getItem(key);
  } catch {
    return fallback;
  }
  if (text === null) return fallback;
  try {
    let value: unknown = JSON.parse(text);
    const mig = migrators.get(key);
    if (mig) value = mig(value);
    if (validate && !validate(value)) throw new Error('invalid');
    return value as T;
  } catch {
    removeKey(key);
    return fallback;
  }
}

/** Returns false on quota errors / unavailable storage / unserialisable values. */
export function writeJSON(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function uid(prefix = 'id'): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}
