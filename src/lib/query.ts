/**
 * Parse whatever the user pasted into the search/URL field.
 * Accepts: full URLs (soundcloud.com/<user>, /sets/<name>), bare permalinks,
 * snd.sc short links and "@handle". Returns a canonical SoundCloud URL to
 * resolve, or null if it clearly isn't one of those.
 */

export type ParsedQuery =
  | { kind: 'url'; url: string }
  | { kind: 'invalid' };

export function parseQuery(raw: string): ParsedQuery {
  const input = raw.trim();
  if (!input) return { kind: 'invalid' };

  // Bare handle: "bfrend" or "@bfrend"
  if (/^@?[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/.test(input)) {
    const permalink = input.replace(/^@/, '');
    return { kind: 'url', url: `https://soundcloud.com/${permalink}` };
  }

  // Anything that looks like a URL or domain path
  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { kind: 'invalid' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const allowed = host === 'soundcloud.com' || host === 'snd.sc' || host === 'm.soundcloud.com';
  if (!allowed) return { kind: 'invalid' };

  // Keep path + query (query matters for some share links), drop tracking params
  const clean = new URL(parsed.origin + parsed.pathname);
  const share = parsed.searchParams.get('si'); // SoundCloud share token — harmless, pass it along
  if (share) clean.searchParams.set('si', share);
  return { kind: 'url', url: clean.toString() };
}

/** True when the string is something we can attempt to resolve. */
export function isResolvableInput(raw: string): boolean {
  return parseQuery(raw).kind === 'url';
}

/** Extract a permalink ("bfrend") from a parsed soundcloud URL for display. */
export function permalinkFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (hostIsSndSc(u.hostname)) return null; // short link — resolved server side
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

function hostIsSndSc(host: string): boolean {
  return host.toLowerCase().replace(/^www\./, '') === 'snd.sc';
}

/**
 * True when the input should be treated as a SoundCloud URL/handle rather
 * than a search query. Anything else (plain words, questions, multi-word)
 * goes to the search page.
 */
export function looksLikeSoundCloudInput(raw: string): boolean {
  const input = raw.trim();
  if (!input) return false;
  if (input.startsWith('@')) return true; // @handle
  return /soundcloud\.com|snd\.sc/i.test(input);
}
