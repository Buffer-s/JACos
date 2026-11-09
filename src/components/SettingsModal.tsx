import { useEffect, useState } from 'react';
import {
  detectClientId,
  getApiProxy,
  getClientIdSource,
  getCustomClientId,
  setApiProxy,
  setCustomClientId,
  clearCustomClientId,
  resolveUrl,
  getActiveRouteLabel,
  clearActiveRoute,
  ClientIdUnavailableError,
} from '../lib/soundcloud';
import { version } from '../../package.json';
import { cacheStats, clearAudioCache, onCacheChange, type CacheStats } from '../lib/audio-cache';
import { toast } from '../lib/toast';
import GitHubMark from './GitHubMark';

const GITHUB_URL = 'https://github.com/bufferclick/JACos';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [clientId, setClientId] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [proxy, setProxy] = useState('');
  const [testing, setTesting] = useState(false);
  const [route, setRoute] = useState<string>('Not detected yet');

  const refreshStats = () => void cacheStats().then(setStats);

  useEffect(() => {
    if (!open) return;
    setClientId(getCustomClientId() ?? '');
    setProxy(getApiProxy());
    setSource(getClientIdSource());
    setRoute(getActiveRouteLabel());
    // warm detection in the background so the status line is truthful
    detectClientId()
      .then(() => setSource(getClientIdSource()))
      .catch(() => setSource(getClientIdSource()));
    refreshStats();
    const unsub = onCacheChange(refreshStats);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const saveClientId = () => {
    const v = clientId.trim();
    if (!v) {
      clearCustomClientId();
      toast('Custom client_id removed — auto-detection will be used.');
    } else {
      if (!/^[0-9a-zA-Z]{16,64}$/.test(v)) {
        toast('That does not look like a client_id (16–64 alphanumerics).');
        return;
      }
      setCustomClientId(v);
      toast('Custom client_id saved.');
    }
    setSource(getClientIdSource());
  };

  const saveProxy = () => {
    setApiProxy(proxy);
    toast(proxy.trim() ? 'API proxy saved.' : 'API proxy removed.');
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      await detectClientId({ forceRefresh: true });
      const target = await resolveUrl('https://soundcloud.com/soundcloud');
      if (target.kind === 'user') {
        toast(`Connection OK — resolved "${target.user.username}" (id ${target.user.id}).`);
      } else {
        toast('Connection OK — api-v2 responded.');
      }
      setSource(getClientIdSource());
      setRoute(getActiveRouteLabel());
    } catch (err) {
      if (err instanceof ClientIdUnavailableError) toast('Could not detect a client_id. Paste one below.');
      else toast(err instanceof Error ? err.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const sourceLabel =
    source === 'server' ? 'Built-in bridge (no setup needed)' : source === 'custom' ? 'Custom (yours)' : source === 'scrape' ? 'Auto-detected from soundcloud.com' : source === 'cache' ? 'Auto-detected (cached)' : 'Not needed — handled by the bridge';

  const mb = stats ? (stats.bytes / (1024 * 1024)).toFixed(1) : '–';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="modal-body">
          {/* ---- SoundCloud connection ---- */}
          <section className="modal-section">
            <h3>SoundCloud connection</h3>
            <p className="modal-status">
              <span className="status-label">client_id</span> {sourceLabel}
            </p>
            <p className="modal-status">
              <span className="status-label">route</span> {route}
            </p>
            <p className="modal-help">
              On Cloudflare Pages, JACos talks to SoundCloud through a tiny built-in server bridge —
              no buttons to press, nothing to paste. If the static build is hosted somewhere without
              that bridge, JACos falls back to a route chain: your custom proxy (if set) &rarr; direct &rarr;
              corsproxy.io &rarr; api.cors.lol &rarr; api.allorigins.win. The one that answers first is
              <strong> remembered</strong>; if it stops working, JACos falls back automatically.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => { clearActiveRoute(); setRoute(getActiveRouteLabel()); toast('Route memory cleared — the chain will be re-probed on the next request.'); }} style={{ marginBottom: 4 }}>
              Forget remembered route
            </button>
            <p className="modal-help" style={{ marginTop: 10 }}>
              SoundCloud has no public API keys, so JACos detects the same client_id the web player uses.
              Detection normally just works. If it doesn&rsquo;t (or expires), open soundcloud.com in a tab,
              watch any api-v2 request in DevTools → Network and copy the <code>client_id</code> query parameter.
            </p>
            <label className="field-label" htmlFor="client-id-input">Custom client_id (optional)</label>
            <div className="field-row">
              <input
                id="client-id-input"
                className="text-input mono"
                placeholder="32-character client_id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn-orange-solid btn-sm" onClick={saveClientId}>Save</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => void testConnection()} disabled={testing} style={{ marginTop: 10 }}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>

            <label className="field-label" htmlFor="proxy-input" style={{ marginTop: 18 }}>Custom CORS proxy (advanced)</label>
            <p className="modal-help">Optional. Tried before everything else. Requests are sent as <code>PROXY?url=&lt;encoded&gt;</code>. If your proxy stops working, JACos falls back to the chain automatically. Leave empty to use the automatic chain.</p>
            <div className="field-row">
              <input
                id="proxy-input"
                className="text-input mono"
                placeholder="https://your-cors-proxy.example/?url="
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn-orange-solid btn-sm" onClick={saveProxy}>Save</button>
            </div>
          </section>

          {/* ---- Audio cache ---- */}
          <section className="modal-section">
            <h3>Audio cache</h3>
            <p className="modal-help">
              Songs stream from SoundCloud&rsquo;s CDN exactly as on the real site. The first play downloads the
              MP3 once into your browser&rsquo;s <strong>Cache Storage</strong> — capped at
              40 tracks / 256&nbsp;MB, oldest evicted automatically. Replays come straight from cache.
            </p>
            <div className="cache-row">
              <div className="cache-stat">
                <span className="cache-num">{stats?.supported === false ? '–' : stats?.entries ?? '…'}</span>
                <span className="cache-label">tracks cached</span>
              </div>
              <div className="cache-stat">
                <span className="cache-num">{stats ? `${mb} MB` : '…'}</span>
                <span className="cache-label">cache size</span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => { void clearAudioCache().then(() => { toast('Audio cache cleared.'); refreshStats(); }); }}>
                Clear cache
              </button>
            </div>
          </section>

          {/* ---- About ---- */}
          <section className="modal-section">
            <h3>About</h3>
            <p className="modal-help" style={{ marginBottom: 12 }}>
              JACo&rsquo;s Soundcloud v{version} — open source (MIT), made by Buffer. Not affiliated with SoundCloud AB.
            </p>
            <a className="btn btn-dark btn-sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubMark size={15} /> View on GitHub
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
