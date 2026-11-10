/**
 * Cloudflare Pages Function — same-origin media proxy for SoundCloud's CDN.
 *
 * Why this exists: SoundCloud serves signed media URLs from sndcdn.com without
 * reliable CORS headers, which breaks (a) saving audio for offline playback,
 * (b) downloading a track to a file, and (c) hls.js playback, all of which need
 * the browser to read the bytes. Routing the request through this edge proxy
 * makes it same-origin, so those features work everywhere.
 *
 * /api/media?u=<https url>                     → streams the file (range requests supported)
 * /api/media?u=<https url>&download=1&name=... → same, with Content-Disposition: attachment
 *
 * HLS playlists (.m3u8) are rewritten on the fly so every segment/key URI inside
 * them is also proxied — otherwise a proxied manifest would point the player
 * back at CORS-blocked CDN URLs.
 *
 * Bytes are never stored on Cloudflare's side (cache-control: no-store); they
 * stream straight from SoundCloud to the visitor. Only sndcdn.com and
 * soundcloud.com hosts are allowed.
 */

interface PagesEventContext {
  request: Request;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ALLOWED_HOST = /^([a-z0-9-]+\.)*(sndcdn\.com|soundcloud\.com)$/i;
const MAX_URL = 2048;

function bad(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Sanitize a download filename (strict — this lands in a header). */
function safeFilename(raw: string): string {
  const clean = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return clean || 'track';
}

/** Rewrite every URI in an HLS manifest to go through this proxy. */
function rewriteManifest(text: string, base: URL): string {
  const wrap = (uri: string): string => {
    try {
      const abs = new URL(uri, base).toString();
      return `/api/media?u=${encodeURIComponent(abs)}`;
    } catch {
      return uri;
    }
  };
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // tags may carry URI="..." (e.g. EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${wrap(uri)}"`);
      }
      return wrap(trimmed);
    })
    .join('\n');
}

export async function onRequestGet(context: PagesEventContext): Promise<Response> {
  const reqUrl = new URL(context.request.url);
  const raw = reqUrl.searchParams.get('u');
  if (!raw) return bad(400, 'missing u');
  if (raw.length > MAX_URL) return bad(414, 'url too long');

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return bad(400, 'bad u');
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOST.test(target.hostname)) {
    return bad(403, 'host not allowed');
  }

  const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*' };
  const range = context.request.headers.get('range');
  if (range) headers.range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow' });
  } catch {
    return bad(502, 'upstream unreachable');
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const looksManifest =
    contentType.includes('mpegurl') || /\.m3u8($|\?)/i.test(target.pathname) || target.pathname.endsWith('.m3u8');

  if (looksManifest) {
    const text = await upstream.text();
    if (!upstream.ok) return bad(upstream.status, `upstream ${upstream.status}`);
    return new Response(rewriteManifest(text, target), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    });
  }

  const outHeaders: Record<string, string> = {
    'content-type': contentType || 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) outHeaders['content-length'] = contentLength;

  if (reqUrl.searchParams.get('download') === '1') {
    const name = safeFilename(reqUrl.searchParams.get('name') ?? 'track.mp3');
    const filename = name.toLowerCase().endsWith('.mp3') ? name : `${name}.mp3`;
    outHeaders['content-disposition'] = `attachment; filename="${filename.replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  const status = upstream.status === 206 ? 206 : upstream.status;
  return new Response(upstream.body, { status, headers: outHeaders });
}
