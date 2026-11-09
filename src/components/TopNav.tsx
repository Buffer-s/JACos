import { useEffect, useState } from 'react';
import Logo from './Logo';
import GitHubMark from './GitHubMark';
import SettingsModal from './SettingsModal';
import { parseQuery } from '../lib/query';
import { resolveUrl, ClientIdUnavailableError } from '../lib/soundcloud';
import { useHashRoute, navigate } from '../lib/router';
import { toast } from '../lib/toast';

export const GITHUB_URL = 'https://github.com/bufferclick/JACos';

export default function TopNav() {
  const route = useHashRoute();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('jacos:open-settings', open);
    return () => window.removeEventListener('jacos:open-settings', open);
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const parsed = parseQuery(query);
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
      if (err instanceof ClientIdUnavailableError) {
        toast('SoundCloud connection failed. Open Settings to paste a client_id.', {
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
          <nav className="topnav-nav" aria-label="Primary">
            <a href="#/" className={`nav-link${route.name === 'home' ? ' is-active' : ''}`}>Home</a>
          </nav>

          <form className="search" role="search" onSubmit={(e) => void submit(e)}>
            <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m11.2 11.2 3.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste a SoundCloud profile, playlist or track URL…"
              aria-label="SoundCloud URL"
              spellCheck={false}
              autoComplete="off"
              enterKeyHint="go"
            />
            {busy && <span className="search-spinner" aria-hidden="true" />}
          </form>

          <div className="topnav-right">
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
