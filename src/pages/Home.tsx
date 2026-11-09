import { useEffect, useState } from 'react';
import { parseQuery } from '../lib/query';
import { resolveUrl, ClientIdUnavailableError } from '../lib/soundcloud';
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

const EXAMPLES = ['soundcloud.com/bfrend', 'soundcloud.com/basshunter'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [recents, setRecents] = useState<RecentUser[]>([]);

  useEffect(() => {
    setRecents(readJSON<RecentUser[]>('recent', []));
  }, []);

  const go = async (raw: string) => {
    const parsed = parseQuery(raw);
    if (parsed.kind !== 'url') {
      toast('Enter a SoundCloud URL or @handle — e.g. soundcloud.com/bfrend');
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
      if (err instanceof ClientIdUnavailableError) {
        toast('SoundCloud connection failed. Open Settings to paste a client_id.', {
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
            Paste a public SoundCloud profile or playlist URL. JACos lists what the user publishes and
            streams every track in your browser — no account, no sign-in, no files written to disk.
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
              placeholder="soundcloud.com/bfrend"
              aria-label="SoundCloud profile or playlist URL"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              enterKeyHint="go"
            />
            <button type="submit" className="btn btn-orange-solid hero-cta" disabled={busy}>
              {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {busy ? 'Resolving…' : 'Find playlists'}
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

        {/* ----------------------------------- CSS-drawn product mock (not an image) */}
        <div className="hero-mock" aria-hidden="true">
          <div className="mock-window">
            <div className="mock-chrome">
              <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
              <span className="mock-address">soundcloud.com/basshunter/sets/…</span>
            </div>
            <div className="mock-body">
              <div className="mock-side">
                <div className="mock-art">
                  <svg viewBox="0 0 48 48" width="52" height="52" fill="none"><path d="M8 26a7 7 0 0 1 6.7-7 10.2 10.2 0 0 1 10-7.8A10.5 10.5 0 0 1 34 17.4 8.3 8.3 0 0 1 44 24a8.3 8.3 0 0 1-3.2 6.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".95"/></svg>
                </div>
                <div className="mock-line w70 h16" />
                <div className="mock-line w40 h12" />
                <div className="mock-playbtn">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M9 6.8v10.4a.8.8 0 0 0 1.22.68l8.2-5.2a.8.8 0 0 0 0-1.36l-8.2-5.2A.8.8 0 0 0 9 6.8Z"/></svg>
                </div>
                <div className="mock-line w90 h10 mt8" />
                <div className="mock-line w60 h10" />
              </div>
              <div className="mock-tracks">
                {[0.92, 0.74, 1, 0.6, 0.82, 0.68].map((w, i) => (
                  <div className="mock-row" key={i}>
                    <div className={`mock-rnum${i === 2 ? ' is-live' : ''}`}>{i + 1}</div>
                    <div className="mock-rmain">
                      <div className={`mock-line ${i === 2 ? 'is-live' : ''}`} style={{ width: `${w * 78}%`, height: 11 }} />
                      <div className="mock-line w45 h9" />
                    </div>
                    <div className="mock-rwave">
                      {Array.from({ length: 26 }).map((_, j) => (
                        <i key={j} style={{ height: `${18 + ((i * 31 + j * 37) % 60)}%` }} className={i === 2 && j < 14 ? 'is-played' : ''} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mock-caption">A playlist page — same layout, same orange, no account required.</p>
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
            <p>Tracks stream from SoundCloud&rsquo;s CDN and are stored once in your browser&rsquo;s Cache Storage — never as files on disk.</p>
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
