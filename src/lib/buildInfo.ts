/**
 * Build identity.
 *
 * `version` is read from package.json and inlined at build time; the timestamp
 * is injected by vite.config.ts. Together they answer the one question a
 * footer keeps raising: "is this page running the build I just shipped?"
 *
 * Bump `package.json` and the footer, Settings → About, the README badge and
 * the `index.html` generator meta all follow — none of them hardcode a number.
 */

import { version } from '../../package.json';

/** Injected by `define` in vite.config.ts (`''` during dev). */
declare const __BUILD_TIME__: string;

const RAW_BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

export const appVersion: string = version;

/** "12 Nov 2026, 08:12 UTC" — null in dev builds. */
export function formatBuildTime(): string | null {
  if (!RAW_BUILD_TIME) return null;
  const date = new Date(RAW_BUILD_TIME);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

/** "built 12 Nov 2026, 08:12 UTC" / "dev build" */
export function buildLabel(): string {
  const time = formatBuildTime();
  if (time) return `built ${time}`;
  return import.meta.env.PROD ? 'release build' : 'dev build';
}

/** Footer tooltip: version + build time. */
export function buildTitle(): string {
  const time = formatBuildTime();
  return time ? `JACos v${appVersion} — ${time}` : `JACos v${appVersion} — ${buildLabel()}`;
}
