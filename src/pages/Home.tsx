import { useEffect, useState } from 'react';
import { parseQuery, looksLikeSoundCloudInput } from '../lib/query';
import { resolveUrl, ClientIdUnavailableError, ApiError } from '../lib/soundcloud';
import { navigate, openSettings } from '../lib/router';
import { toast } from '../lib/toast';
import { readJSON } from '../lib/storage';
import Logo from '../components/Logo';
import GitHubMark from '../components/GitHubMark';
import { GITHUB_URL } from '../components/TopNav';

interface RecentUser {
  permalink: string;
  username: string;
  avatar: string | null;
}

const EXAMPLES = ['soundcloud.com/bfrend'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [recents, setRecents] = useState<RecentUser[]>([]);

  useEffect(() => {
    setRecents(readJSON<RecentUser[]>('recent', []));
  }, []);

  const go = async (raw: string) => {
    const trimmed = raw.trim();
    if (!looksLikeSoundCloudInput(trimmed)) {
      const q = trimmed;
      if (q) navigate(`/search/${encodeURIComponent(q)}`);
      return;
    }
    const parsed = parseQuery(trimmed);
    if (parsed.kind !== 'url') {
      toast('That doesn’t look like a SoundCloud URL.');
      return;
    }
    setBusy(true);
    try {
      const target = await resolveUrl(parsed.url);
      if (target.kind === 'user') navigate(`/user/${encodeURIComponent(target.user.permalink)}`);
      else if (target.kind === 'playlist') navigate(`/playlist/${target.playlist.id}`);
      else if (target.kind === 'track') {
        const uploader = target.track.user?.permalink;
        navigate(uploader ? `/user/${encodeURIComponent(uploader)}` : '/');
      } else toast('Could not resolve that URL.');
    } catch (err) {
      if (err instanceof ClientIdUnavailableError || (err instanceof ApiError && [0, 401, 403].includes(err.status))) {
        toast('Couldn’t load this from SoundCloud. Open Settings to fix the connection.', {
          actionLabel: 'Settings',
          onAction: openSettings,
        });
      } else {
        toast(err instanceof Error ? err.message : 'Could not resolve that URL.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home">
      {/* -------------------------------------------------- hero */}
      <section className="hero">
        <div className="hero-copy-col">
          <div className="hero-eyebrow">
            <Logo size={54} variant="mark" />
            <div className="hero-wordmark">
              <span className="hero-jacos">JACo&rsquo;s</span>
              <span className="hero-soundcloud">Soundcloud</span>
            </div>
          </div>
          <p className="hero-tagline">Just Another Copy of Sweden&rsquo;s Soundcloud</p>
          <p className="hero-copy">
            Search the whole SoundCloud catalog — tracks, playlists, people — or paste a URL.
            All of it streams from SoundCloud&rsquo;s own CDN.
          </p>

          <form
            className="hero-form"
            onSubmit={(e) => {
              e.preventDefault();
              void go(query);
            }}
          >
            <input
              className="hero-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracks, playlists, people — or paste a URL"
              aria-label="Search SoundCloud or paste a URL"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              enterKeyHint="go"
            />
            <button type="submit" className="btn btn-orange-solid hero-cta" disabled={busy}>
              {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {busy ? 'Resolving…' : 'Search'}
            </button>
          </form>

          <div className="hero-examples">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => { setQuery(ex); void go(ex); }}>
                {ex}
              </button>
            ))}
          </div>

          {recents.length > 0 && (
            <div className="hero-recents">
              <span>Recently viewed:</span>
              {recents.map((r) => (
                <a key={r.permalink} className="chip chip-recent" href={`#/user/${encodeURIComponent(r.permalink)}`}>
                  {r.avatar && <img src={r.avatar} alt="" width={16} height={16} />}
                  {r.username}
                </a>
              ))}
            </div>
          )}
        </div>

      </section>

      {/* -------------------------------------------------- how it works */}
      <section className="how" aria-label="How it works">
        <h2 className="how-title">How it works</h2>
        <ol className="how-steps">
          <li className="how-step">
            <span className="how-num">1</span>
            <h3>Paste a URL</h3>
            <p>A profile like <code>soundcloud.com/bfrend</code>, a <code>/sets/…</code> playlist link, or even a bare <code>@handle</code>.</p>
          </li>
          <li className="how-step">
            <span className="how-num">2</span>
            <h3>Browse their playlists</h3>
            <p>JACos fetches the user&rsquo;s public playlists and tracks straight from SoundCloud&rsquo;s own endpoints.</p>
          </li>
          <li className="how-step">
            <span className="how-num">3</span>
            <h3>Press play</h3>
            <p>Tracks stream from SoundCloud&rsquo;s CDN and are cached once in your browser&rsquo;s Cache Storage — replays come straight from cache.</p>
          </li>
        </ol>
      </section>

      {/* -------------------------------------------------- open source banner */}
      <section className="oss-banner" aria-label="Open source">
        <div className="oss-text">
          <GitHubMark size={26} className="oss-mark" />
          <div>
            <h2>Open source, made by Buffer</h2>
            <p>JACo&rsquo;s Soundcloud is free software under the MIT license. Read the code, file an issue, or send a pull request.</p>
          </div>
        </div>
        <a className="btn btn-orange-solid" href={GITHUB_URL} target="_blank" rel="noreferrer">
          <GitHubMark size={16} /> View on GitHub
        </a>
      </section>
    </div>
  );
}
