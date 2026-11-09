/**
 * Cloudflare Pages Function — server-side bridge to SoundCloud's api-v2.
 *
 * Browsers can't call SoundCloud directly (CORS) and can't scrape the web
 * player's client_id. Pages Functions run on Cloudflare's edge, so there's
 * no CORS and we can present a browser User-Agent like soundcloud.com's own
 * web client does. The SPA calls `/api/sc?path=/resolve&url=…` and gets the
 * upstream JSON back. Zero configuration; no client_id settings needed.
 *
 * Optional env var: SOUNDCLOUD_CLIENT_ID — skip scraping entirely.
 * (In-memory cache lives per isolate, exactly like the Next.js version did.)
 */

interface Env {
  SOUNDCLOUD_CLIENT_ID?: string;
}

interface PagesEventContext<E> {
  request: Request;
  env: E;
}

const API = 'https://api-v2.soundcloud.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_ENTRIES = 400;
const MIN = 60_000;
type Entry = { status: number; body: string; expires: number };

interface ScState {
  cache: Map<string, Entry>;
  inflight: Map<string, Promise<Entry>>;
  clientId?: { id: string; expires: number } | undefined;
}

const store = globalThis as unknown as { __jacosSc?: ScState };
const state: ScState = (store.__jacosSc ??= { cache: new Map(), inflight: new Map() });
let clientIdInflight: Promise<string> | null = null;

function cacheGet(key: string): Entry | null {
  const e = state.cache.get(key);
  return e && e.expires > Date.now() ? e : null;
}
function cacheSet(key: string, entry: Entry): void {
  if (state.cache.size >= MAX_ENTRIES) {
    const oldest = state.cache.keys().next().value;
    if (oldest !== undefined) state.cache.delete(oldest);
  }
  state.cache.set(key, entry);
}
const jsonHeaders = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  'cache-control': 'private, max-age=60',
  ...extra,
});

async function scrapeClientId(): Promise<string> {
  const home = await fetch('https://soundcloud.com/', {
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  if (!home.ok) throw new Error(`soundcloud.com responded HTTP ${home.status}`);
  const html = await home.text();

  // Same scrape strategy as the web client: the client_id lives in one of the
  // a-v2.sndcdn.com bundles; check the inline HTML first, then bundles in
  // tail-first order (it tends to hide in the last ones).
  const inline =
    html.match(/[?&,{ ]client_id[:=]"?([a-zA-Z0-9]{32})"?/) ||
    html.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
  if (inline) return inline[1];

  const found = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/[^"]+\.js[^"]*)"/g)) {
    found.add(m[1]);
  }
  for (const m of html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/[^"'\s]+\.js[^"'\s]*/g)) {
    found.add(m[0]);
  }
  const scripts = [...found].reverse();

  for (const src of scripts.slice(0, 20)) {
    try {
      const res = await fetch(src, { headers: { 'user-agent': UA } });
      const js = await res.text();
      const m =
        js.match(/[?&,{ ]client_id[:=]"?([a-zA-Z0-9]{32})"?/) ||
        js.match(/client_id["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/) ||
        js.match(/clientId["']?\s*[:=]\s*["']([0-9a-zA-Z]{32})["']/);
      if (m) return m[1];
    } catch {
      /* try the next bundle */
    }
  }
  throw new Error('Could not obtain a SoundCloud client_id');
}

async function getClientId(force: boolean, env?: Env): Promise<string> {
  if (env?.SOUNDCLOUD_CLIENT_ID) return env.SOUNDCLOUD_CLIENT_ID;
  if (!force && state.clientId && state.clientId.expires > Date.now()) return state.clientId.id;
  if (!force && clientIdInflight) return clientIdInflight;

  clientIdInflight = scrapeClientId()
    .then((id) => {
      state.clientId = { id, expires: Date.now() + 6 * MIN };
      clientIdInflight = null;
      return id;
    })
    .catch((err: Error) => {
      clientIdInflight = null;
      throw err;
    });
  return clientIdInflight;
}

async function scFetch(
  target: string,
  params: URLSearchParams,
  env?: Env,
): Promise<{ status: number; body: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const clientId = await getClientId(attempt > 0, env);
    const url = new URL(target);
    for (const [k, v] of params) url.searchParams.set(k, v);
    url.searchParams.set('client_id', clientId);

    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    });
    const body = await res.text();
    if (res.status === 404) return { status: 404, body: body || '{"message":"Not found"}' };
    if ((res.status === 401 || res.status === 403) && attempt === 0) continue; // re-scrape, retry once
    return { status: res.status, body };
  }
  return { status: 401, body: '{"message":"SoundCloud rejected the client_id"}' };
}

export async function onRequestGet(context: PagesEventContext<Env>): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  url.searchParams.delete('path');

  let target: string;
  if (/^https:\/\/api-v2\.soundcloud\.com\//i.test(path)) {
    target = path; // absolute api-v2 URL, e.g. stream resolution endpoints
  } else if (/^\/?[A-Za-z0-9/_-][A-Za-z0-9/_.-]*$/.test(path) && path.replace(/^\/+/, '').length > 0) {
    target = `${API}/${path.replace(/^\/+/, '')}`;
  } else {
    return new Response(JSON.stringify({ message: 'Invalid path' }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  const ttl = /\/stream\b/.test(target) ? 25 * MIN : 10 * MIN;
  const key = `${target}?${url.searchParams.toString()}`;

  const hit = cacheGet(key);
  if (hit) return new Response(hit.body, { status: hit.status, headers: jsonHeaders() });

  let work = state.inflight.get(key);
  if (!work) {
    work = (async () => {
      try {
        const r = await scFetch(target, url.searchParams, env);
        return { ...r, expires: Date.now() + ttl };
      } catch (err) {
        // Negative-cache briefly so a struggling upstream doesn't melt the isolate
        return {
          status: 502,
          body: JSON.stringify({ message: `SoundCloud bridge failed: ${(err as Error).message ?? err}` }),
          expires: Date.now() + 30_000,
        };
      }
    })();
    state.inflight.set(key, work);
  }

  try {
    const entry = await work;
    cacheSet(key, entry);
    return new Response(entry.body, { status: entry.status, headers: jsonHeaders() });
  } finally {
    state.inflight.delete(key);
  }
}
