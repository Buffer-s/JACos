import { useEffect, useState } from 'react';
import Logo from './Logo';
import GitHubMark from './GitHubMark';
import SettingsModal from './SettingsModal';
import { parseQuery, looksLikeSoundCloudInput } from '../lib/query';
import { resolveUrl, ClientIdUnavailableError, ApiError } from '../lib/soundcloud';
import { navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';

export const GITHUB_URL = 'https://github.com/bufferclick/JACos';

export default function TopNav() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref());

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('jacos:open-settings', open);
    return () => window.removeEventListener('jacos:open-settings', open);
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    // plain words search SoundCloud; URLs and @handles resolve
    if (!looksLikeSoundCloudInput(trimmed)) {
      setQuery('');
      navigate(`/search/${encodeURIComponent(trimmed)}`);
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
        if (uploader) {
          toast('That was a single track — opened its uploader instead.');
          navigate(`/user/${encodeURIComponent(uploader)}`);
        } else {
          toast('That URL is a single track. Paste a profile or playlist URL.');
        }
      } else {
        toast('Could not resolve that URL.');
      }
      setQuery('');
    } catch (err) {
      if (err instanceof ClientIdUnavailableError || (err instanceof ApiError && [0, 401, 403].includes(err.status))) {
        toast('Couldn’t load this from SoundCloud. Open Settings to fix the connection.', {
          actionLabel: 'Settings',
          onAction: () => setSettingsOpen(true),
        });
      } else {
        toast(err instanceof Error ? err.message : 'Could not resolve that URL.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="topnav">
        <div className="topnav-inner">
          <Logo size={40} />
          <form className="search" role="search" onSubmit={(e) => void submit(e)}>
            <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m11.2 11.2 3.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracks, playlists, people — or paste a URL…"
              aria-label="Search SoundCloud or paste a URL"
              spellCheck={false}
              autoComplete="off"
              enterKeyHint="go"
            />
            {busy && <span className="search-spinner" aria-hidden="true" />}
          </form>

          <div className="topnav-right">
            <button
              className="icon-btn theme-btn"
              onClick={() => {
                const order: ThemePref[] = ['system', 'light', 'dark'];
                const next = order[(order.indexOf(theme) + 1) % order.length];
                setThemePref(next);
                setTheme(next);
              }}
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme} (click to cycle system / light / dark)`}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.2 12.4A7 7 0 0 1 7.6 3.8a7 7 0 1 0 8.6 8.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="4.1" stroke="currentColor" strokeWidth="1.5"/><path d="M10 1.5v2.4M10 16.1v2.4M1.5 10h2.4M16.1 10h2.4M4 4l1.7 1.7M14.3 14.3 16 16M4 16l1.7-1.7M14.3 5.7 16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              )}
            </button>
            <a className="btn btn-github" href={GITHUB_URL} target="_blank" rel="noreferrer" title="View the source on GitHub">
              <GitHubMark size={17} />
              <span>View on GitHub</span>
            </a>
            <button className="icon-btn settings-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M16.4 12.3a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 0 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.96 1.46v.17a1.9 1.9 0 0 1-3.8 0v-.26a1.6 1.6 0 0 0-.96-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.96h-.17a1.9 1.9 0 0 1 0-3.8h.26a1.6 1.6 0 0 0 1.46-.96 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .9-1.46V3.1a1.9 1.9 0 0 1 3.8 0v.26a1.6 1.6 0 0 0 .96 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.9h.17a1.9 1.9 0 0 1 0 3.8h-.26a1.6 1.6 0 0 0-1.46.9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
