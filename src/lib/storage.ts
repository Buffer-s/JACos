/** Typed, defensive localStorage helpers. Never throws. */

const PREFIX = 'jacos:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function readString(key: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? null : raw;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* non-fatal */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* non-fatal */
  }
}

/** Like writeJSON, but surfaces quota/serialization failures (for capacity-critical writes). */
export function writeJSONStrict(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  localStorage.setItem(PREFIX + key, raw);
}
