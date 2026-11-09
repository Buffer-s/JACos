/**
 * Theme handling — light / dark / system, persisted in localStorage.
 * Applied as [data-theme] on <html>; CSS variables do the rest.
 */

export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'theme';
const MEDIA = '(prefers-color-scheme: dark)';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem('jacos:' + KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolved(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  try {
    return window.matchMedia(MEDIA).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(pref: ThemePref): void {
  const mode = resolved(pref);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem('jacos:' + KEY);
    else localStorage.setItem('jacos:' + KEY, pref);
  } catch {
    /* private mode — theme applies for this session only */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent('jacos:theme'));
}

/** Follow OS theme changes while the preference is "system". Call once at boot. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia(MEDIA);
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
